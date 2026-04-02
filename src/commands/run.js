import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import chokidar from 'chokidar';
import ora from 'ora';
import {
  openDb, createSession, endSession, recordFileEvent, getActiveSession,
  recordShellEvent, pruneSessions,
} from '../db.js';
import {
  generateSessionId, agentLabel, VALID_AGENTS, AGENT_COMMANDS,
  formatDuration, isBinaryFile, getFileSize, MAX_SNAPSHOT_SIZE,
} from '../utils.js';

function safeRead(filePath) {
  try {
    const size = getFileSize(filePath);
    if (size < 0 || size > MAX_SNAPSHOT_SIZE) return null;
    if (isBinaryFile(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.agentlog', 'dist', '.next', 'build',
  '__pycache__', '.DS_Store', 'Thumbs.db', '.venv', 'venv',
  '.tox', 'coverage', '.nyc_output',
]);
const IGNORE_EXTENSIONS = new Set(['.pyc', '.db', '.db-shm', '.db-wal']);

function buildIgnoreFn(cwd) {
  const extraDirs = new Set();
  const extraExts = new Set();
  try {
    const config = JSON.parse(fs.readFileSync(path.join(cwd, '.agentlog', 'config.json'), 'utf8'));
    if (Array.isArray(config.ignore)) for (const e of config.ignore) extraDirs.add(e);
    if (Array.isArray(config.excludeExtensions)) for (const e of config.excludeExtensions) extraExts.add(e);
  } catch { /* defaults */ }

  return (filePath) => {
    const basename = path.basename(filePath);
    if (IGNORE_DIRS.has(basename) || extraDirs.has(basename)) return true;
    const ext = path.extname(filePath);
    if (IGNORE_EXTENSIONS.has(ext) || extraExts.has(ext)) return true;
    for (const seg of filePath.split(path.sep)) {
      if (IGNORE_DIRS.has(seg) || extraDirs.has(seg)) return true;
    }
    return false;
  };
}

// ─── PID file helpers ─────────────────────────────────────────────

function pidFilePath(cwd) {
  return path.join(cwd, '.agentlog', 'watcher.pid');
}

function writePidFile(cwd, pid, sessionId) {
  fs.writeFileSync(pidFilePath(cwd), JSON.stringify({ pid, sessionId }), 'utf8');
}

function removePidFile(cwd) {
  try { fs.unlinkSync(pidFilePath(cwd)); } catch { /* ok */ }
}

export function isWatcherRunning(cwd) {
  try {
    const info = JSON.parse(fs.readFileSync(pidFilePath(cwd), 'utf8'));
    process.kill(info.pid, 0); // test if process alive
    return info;
  } catch {
    try { fs.unlinkSync(pidFilePath(cwd)); } catch { /* ok */ }
    return null;
  }
}

// ─── Main command ─────────────────────────────────────────────────

export async function runCommand(agent, options) {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (!fs.existsSync(agentlogDir)) {
    console.log(chalk.red('  No .agentlog/ directory found.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog init')} first.`));
    process.exit(1);
  }

  if (!VALID_AGENTS.includes(agent)) {
    console.log(chalk.red(`  Unknown agent "${agent}".`));
    console.log(chalk.dim(`  Valid agents: ${VALID_AGENTS.join(', ')}`));
    process.exit(1);
  }

  // Check for already-running watcher
  const running = isWatcherRunning(cwd);
  if (running && !options.force) {
    console.log(chalk.yellow(`  A watcher is already running (PID ${running.pid}, session ${chalk.bold(running.sessionId)}).`));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog stop')} first, or use ${chalk.cyan('--force')}.`));
    process.exit(1);
  }

  const db = await openDb(cwd);
  const activeSession = getActiveSession(db, cwd);
  if (activeSession && !options.force) {
    console.log(chalk.yellow(`  Session ${chalk.bold(activeSession.id)} is still active.`));
    console.log(chalk.dim(`  Use ${chalk.cyan('agentlog stop')} or ${chalk.cyan('--force')}.`));
    db.close();
    process.exit(1);
  }

  const agentCmd = AGENT_COMMANDS[agent];
  const isGuiAgent = !agentCmd;
  const shouldBackground = isGuiAgent && !options.foreground;

  // ── Background mode: spawn daemon & return immediately ─────────
  if (shouldBackground) {
    const sessionId = generateSessionId();
    const tags = options.tag ? options.tag.join(',') : '';
    createSession(db, { id: sessionId, agent, cwd, tags });
    db.close();

    const daemonScript = path.resolve(
      path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')),
      '..',
      'daemon.js'
    );

    const child = spawn(process.execPath, [daemonScript], {
      detached: true,
      stdio: 'ignore',
      cwd,
      env: {
        ...process.env,
        __AGENTLOG_SESSION_ID__: sessionId,
        __AGENTLOG_CWD__: cwd,
      },
    });

    child.unref();

    // Give daemon a moment to write pid file
    await new Promise((r) => setTimeout(r, 300));

    console.log('');
    console.log(chalk.green(`  Recording session ${chalk.bold(sessionId)} — ${agentLabel(agent)}`));
    if (tags) console.log(chalk.dim(`   Tags: ${tags}`));
    console.log(chalk.dim(`   Watching in background (PID ${child.pid})`));
    console.log('');
    console.log(chalk.dim('  ┌──────────────────────────────────────────────────┐'));
    console.log(chalk.dim('  │') + `  Use your agent normally. Changes are recorded.   ` + chalk.dim('│'));
    console.log(chalk.dim('  │') + `  When done: ${chalk.cyan('agentlog stop')}                          ` + chalk.dim('│'));
    console.log(chalk.dim('  └──────────────────────────────────────────────────┘'));
    console.log('');
    process.exit(0);
  }

  // ── Foreground mode: CLI agents or --foreground ────────────────
  const sessionId = generateSessionId();
  const tags = options.tag ? options.tag.join(',') : '';
  createSession(db, { id: sessionId, agent, cwd, tags });

  console.log('');
  console.log(chalk.green(`  Recording session ${chalk.bold(sessionId)} — ${agentLabel(agent)}`));
  if (tags) console.log(chalk.dim(`   Tags: ${tags}`));
  console.log(chalk.dim(`   ${cwd}`));

  // Index files
  const ignoreFn = buildIgnoreFn(cwd);
  const preSnapshots = new Map();
  const spinner = ora({ text: 'Indexing project files...', color: 'cyan' }).start();

  await new Promise((resolve) => {
    const sw = chokidar.watch(cwd, {
      ignored: ignoreFn, ignoreInitial: false, persistent: false, followSymlinks: false,
    });
    sw.on('add', (fp) => { const c = safeRead(fp); if (c !== null) preSnapshots.set(fp, c); });
    sw.on('ready', () => sw.close().then(resolve));
  });

  spinner.succeed(`Indexed ${preSnapshots.size} files`);

  // Live watcher
  let eventCount = 0;
  const watcher = chokidar.watch(cwd, {
    ignored: ignoreFn, ignoreInitial: true, persistent: true, followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    atomic: 100,
  });

  function logEvent(type, fp) {
    eventCount++;
    const rel = fp.startsWith(cwd) ? fp.slice(cwd.length + 1) : fp;
    const c = { add: chalk.green, change: chalk.yellow, delete: chalk.red }[type] || chalk.white;
    const l = { add: '+', change: '~', delete: '-' }[type] || '?';
    console.log(chalk.dim(`   ${c(l)} ${rel}`));
  }

  watcher.on('add', (fp) => {
    const size = getFileSize(fp); const binary = isBinaryFile(fp);
    const after = binary ? null : safeRead(fp);
    recordFileEvent(db, { sessionId, type: 'add', filePath: fp, before: null, after, fileSize: size, isBinary: binary });
    if (after !== null) preSnapshots.set(fp, after);
    logEvent('add', fp);
  });
  watcher.on('change', (fp) => {
    const size = getFileSize(fp); const binary = isBinaryFile(fp);
    const before = preSnapshots.get(fp) ?? null;
    const after = binary ? null : safeRead(fp);
    recordFileEvent(db, { sessionId, type: 'change', filePath: fp, before, after, fileSize: size, isBinary: binary });
    if (after !== null) preSnapshots.set(fp, after);
    logEvent('change', fp);
  });
  watcher.on('unlink', (fp) => {
    const before = preSnapshots.get(fp) ?? null;
    recordFileEvent(db, { sessionId, type: 'delete', filePath: fp, before, after: null, fileSize: 0, isBinary: false });
    preSnapshots.delete(fp);
    logEvent('delete', fp);
  });
  watcher.on('error', (err) => console.log(chalk.red(`   Watcher error: ${err.message}`)));

  writePidFile(cwd, process.pid, sessionId);
  const sessionStart = Date.now();
  let cleaning = false;

  async function cleanup(exitCode) {
    if (cleaning) return;
    cleaning = true;
    await watcher.close();
    endSession(db, sessionId, exitCode);
    try {
      const config = JSON.parse(fs.readFileSync(path.join(cwd, '.agentlog', 'config.json'), 'utf8'));
      if (config.maxSessionHistory) pruneSessions(db, config.maxSessionHistory);
    } catch { /* ok */ }
    db.close();
    removePidFile(cwd);

    console.log('');
    console.log(chalk.green(`  Session ${chalk.bold(sessionId)} ended`));
    console.log(chalk.dim(`   Duration: ${formatDuration(Date.now() - sessionStart)}  |  ${eventCount} file event(s)  |  Exit: ${exitCode}`));
    console.log('');
    console.log(chalk.dim('  Review:'));
    console.log(`  ${chalk.cyan(`agentlog diff ${sessionId}`)}`);
    console.log(`  ${chalk.cyan(`agentlog rollback ${sessionId}`)}`);
    console.log('');
    process.exit(exitCode);
  }

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));

  if (agentCmd) {
    const args = options.args ? options.args.split(' ') : [];
    const fullCmd = [agentCmd, ...args].join(' ');
    recordShellEvent(db, { sessionId, command: fullCmd, cwd });
    console.log(chalk.dim(`   Spawning: ${fullCmd}`));
    console.log('');
    const child = spawn(agentCmd, args, { stdio: 'inherit', cwd, shell: true, env: { ...process.env } });
    child.on('error', (err) => { console.log(chalk.red(`  Failed to spawn "${agentCmd}": ${err.message}`)); cleanup(1); });
    child.on('exit', (code) => cleanup(code ?? 0));
  } else {
    console.log(chalk.dim(`   ${agentLabel(agent)} — watching filesystem. Press Ctrl+C to stop.`));
    console.log('');
  }
}
