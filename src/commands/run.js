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

/**
 * Safely read a text file, returning null on error or if binary/too large.
 */
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

/**
 * Default directory/file names to ignore.
 */
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.agentlog', 'dist', '.next', 'build',
  '__pycache__', '.DS_Store', 'Thumbs.db', '.venv', 'venv',
  '.tox', 'coverage', '.nyc_output',
]);

const IGNORE_EXTENSIONS = new Set(['.pyc', '.db', '.db-shm', '.db-wal']);

/**
 * Load config and build the chokidar ignore function.
 */
function buildIgnoreFn(cwd) {
  const extraDirs = new Set();
  const extraExts = new Set();
  try {
    const configPath = path.join(cwd, '.agentlog', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.ignore)) {
      for (const entry of config.ignore) extraDirs.add(entry);
    }
    if (Array.isArray(config.excludeExtensions)) {
      for (const ext of config.excludeExtensions) extraExts.add(ext);
    }
  } catch {
    // defaults only
  }

  return (filePath) => {
    const basename = path.basename(filePath);
    if (IGNORE_DIRS.has(basename) || extraDirs.has(basename)) return true;
    const ext = path.extname(filePath);
    if (IGNORE_EXTENSIONS.has(ext) || extraExts.has(ext)) return true;
    const segments = filePath.split(path.sep);
    for (const seg of segments) {
      if (IGNORE_DIRS.has(seg) || extraDirs.has(seg)) return true;
    }
    return false;
  };
}

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

  const db = await openDb(cwd);

  // Concurrent session protection
  const activeSession = getActiveSession(db, cwd);
  if (activeSession && !options.force) {
    console.log(chalk.yellow(`  Session ${chalk.bold(activeSession.id)} is already active in this directory.`));
    console.log(chalk.dim(`  Use ${chalk.cyan('--force')} to start a new session anyway.`));
    db.close();
    process.exit(1);
  }

  const sessionId = generateSessionId();
  const tags = options.tag ? options.tag.join(',') : '';
  createSession(db, { id: sessionId, agent, cwd, tags });

  const ignoreFn = buildIgnoreFn(cwd);
  const preSnapshots = new Map();
  const sessionStart = Date.now();
  let fileEventCount = 0;
  let cleaning = false;

  console.log('');
  console.log(chalk.green(`  Recording session ${chalk.bold(sessionId)} — ${agentLabel(agent)}`));
  if (tags) console.log(chalk.dim(`   Tags: ${tags}`));
  console.log(chalk.dim(`   ${cwd}`));

  // ── Phase 1: Pre-snapshot pass ──────────────────────────────────
  const spinner = ora({ text: 'Indexing project files...', color: 'cyan' }).start();

  await new Promise((resolve) => {
    const snapshotWatcher = chokidar.watch(cwd, {
      ignored: ignoreFn,
      ignoreInitial: false,
      persistent: false,
      followSymlinks: false,
    });

    snapshotWatcher.on('add', (filePath) => {
      const content = safeRead(filePath);
      if (content !== null) {
        preSnapshots.set(filePath, content);
      }
    });

    snapshotWatcher.on('ready', () => {
      snapshotWatcher.close().then(resolve);
    });
  });

  spinner.succeed(`Indexed ${preSnapshots.size} files`);

  // ── Phase 2: Main file watcher ──────────────────────────────────
  // Use low stabilityThreshold so rapid agent writes are captured quickly.
  // usePolling as fallback for network drives / containers where inotify fails.
  const watcher = chokidar.watch(cwd, {
    ignored: ignoreFn,
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
    // Atomic writes: some editors write to a tmp file then rename.
    // This ensures we catch the rename as a change event.
    atomic: 100,
  });

  function logEvent(type, filePath) {
    fileEventCount++;
    const rel = filePath.startsWith(cwd) ? filePath.slice(cwd.length + 1) : filePath;
    const typeColors = { add: chalk.green, change: chalk.yellow, delete: chalk.red };
    const colorFn = typeColors[type] || chalk.white;
    const label = { add: '+', change: '~', delete: '-' }[type] || '?';
    console.log(chalk.dim(`   ${colorFn(label)} ${rel}`));
  }

  watcher.on('add', (filePath) => {
    const size = getFileSize(filePath);
    const binary = isBinaryFile(filePath);
    const after = binary ? null : safeRead(filePath);
    recordFileEvent(db, {
      sessionId, type: 'add', filePath, before: null, after, fileSize: size, isBinary: binary,
    });
    if (after !== null) preSnapshots.set(filePath, after);
    logEvent('add', filePath);
  });

  watcher.on('change', (filePath) => {
    const size = getFileSize(filePath);
    const binary = isBinaryFile(filePath);
    const before = preSnapshots.get(filePath) ?? null;
    const after = binary ? null : safeRead(filePath);
    recordFileEvent(db, {
      sessionId, type: 'change', filePath, before, after, fileSize: size, isBinary: binary,
    });
    if (after !== null) preSnapshots.set(filePath, after);
    logEvent('change', filePath);
  });

  watcher.on('unlink', (filePath) => {
    const before = preSnapshots.get(filePath) ?? null;
    recordFileEvent(db, {
      sessionId, type: 'delete', filePath, before, after: null, fileSize: 0, isBinary: false,
    });
    preSnapshots.delete(filePath);
    logEvent('delete', filePath);
  });

  // Catch watcher errors so events aren't silently dropped
  watcher.on('error', (err) => {
    console.log(chalk.red(`   Watcher error: ${err.message}`));
  });

  // ── Cleanup function ────────────────────────────────────────────
  async function cleanup(exitCode) {
    if (cleaning) return;
    cleaning = true;

    await watcher.close();
    endSession(db, sessionId, exitCode);

    // Prune old sessions if configured
    try {
      const configPath = path.join(cwd, '.agentlog', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.maxSessionHistory) {
        const pruned = pruneSessions(db, config.maxSessionHistory);
        if (pruned > 0) {
          console.log(chalk.dim(`   Pruned ${pruned} old session(s)`));
        }
      }
    } catch {
      // no config or invalid
    }

    db.close();

    const elapsed = Date.now() - sessionStart;
    console.log('');
    console.log(chalk.green(`  Session ${chalk.bold(sessionId)} ended`));
    console.log(chalk.dim(`   Duration: ${formatDuration(elapsed)}  |  ${fileEventCount} file event(s)  |  Exit: ${exitCode}`));
    console.log('');
    console.log(chalk.dim('  Review:'));
    console.log(`  ${chalk.cyan(`agentlog diff ${sessionId}`)}`);
    console.log(`  ${chalk.cyan(`agentlog rollback ${sessionId}`)}`);
    console.log('');

    process.exit(exitCode);
  }

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));

  // ── Phase 3: Spawn agent CLI or watch mode ─────────────────────
  const agentCmd = AGENT_COMMANDS[agent];
  if (agentCmd) {
    const args = options.args ? options.args.split(' ') : [];
    const fullCmd = [agentCmd, ...args].join(' ');

    recordShellEvent(db, { sessionId, command: fullCmd, cwd });
    console.log(chalk.dim(`   Spawning: ${fullCmd}`));
    console.log('');

    const child = spawn(agentCmd, args, {
      stdio: 'inherit',
      cwd,
      shell: true,
      env: { ...process.env },
    });

    child.on('error', (err) => {
      console.log(chalk.red(`  Failed to spawn "${agentCmd}": ${err.message}`));
      cleanup(1);
    });

    child.on('exit', (code) => {
      cleanup(code ?? 0);
    });
  } else {
    console.log(chalk.dim(`   ${agentLabel(agent)} is a GUI agent — watching filesystem only.`));
    console.log(chalk.dim('   Press Ctrl+C to stop recording.'));
    console.log('');
  }
}
