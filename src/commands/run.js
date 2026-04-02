import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import chalk from 'chalk';
import chokidar from 'chokidar';
import { openDb, createSession, endSession, recordFileEvent, recordShellEvent } from '../db.js';
import {
  generateSessionId,
  agentLabel,
  VALID_AGENTS,
  AGENT_COMMANDS,
  formatDuration,
} from '../utils.js';

/**
 * Safely read a file, returning null on any error.
 */
function safeRead(filePath) {
  try {
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
  '__pycache__', '.DS_Store', 'Thumbs.db',
]);

const IGNORE_EXTENSIONS = new Set(['.pyc', '.db', '.db-shm', '.db-wal']);

/**
 * Build an ignore function for chokidar v4 (glob strings not supported).
 */
function buildIgnoreFn(cwd) {
  // Load extra ignore entries from config
  const extraDirs = new Set();
  try {
    const configPath = path.join(cwd, '.agentlog', 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (Array.isArray(config.ignore)) {
      for (const entry of config.ignore) {
        extraDirs.add(entry);
      }
    }
  } catch {
    // No config or invalid — use defaults only
  }

  return (filePath) => {
    const basename = path.basename(filePath);
    // Check directory/file names
    if (IGNORE_DIRS.has(basename) || extraDirs.has(basename)) return true;
    // Check extensions
    const ext = path.extname(filePath);
    if (IGNORE_EXTENSIONS.has(ext)) return true;
    // Check if path contains an ignored segment
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
    console.log(chalk.red('✖  No .agentlog/ directory found.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog init')} first.`));
    process.exit(1);
  }

  if (!VALID_AGENTS.includes(agent)) {
    console.log(chalk.red(`✖  Unknown agent "${agent}".`));
    console.log(chalk.dim(`  Valid agents: ${VALID_AGENTS.join(', ')}`));
    process.exit(1);
  }

  const db = openDb(cwd);
  const sessionId = generateSessionId();
  createSession(db, { id: sessionId, agent, cwd });

  const ignoreFn = buildIgnoreFn(cwd);
  const preSnapshots = new Map();
  let cleaning = false;

  console.log('');
  console.log(chalk.green(`●  Recording session ${chalk.bold(sessionId)} — ${agentLabel(agent)}`));
  console.log(chalk.dim(`   ${cwd}`));

  // ── Phase 1: Pre-snapshot pass ──────────────────────────────────
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

  console.log(chalk.dim(`   Indexed ${preSnapshots.size} files`));

  // ── Phase 2: Main file watcher ──────────────────────────────────
  const watcher = chokidar.watch(cwd, {
    ignored: ignoreFn,
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  watcher.on('add', (filePath) => {
    const after = safeRead(filePath);
    recordFileEvent(db, {
      sessionId,
      type: 'add',
      filePath,
      before: null,
      after,
    });
    preSnapshots.set(filePath, after);
  });

  watcher.on('change', (filePath) => {
    const before = preSnapshots.get(filePath) ?? null;
    const after = safeRead(filePath);
    recordFileEvent(db, {
      sessionId,
      type: 'change',
      filePath,
      before,
      after,
    });
    preSnapshots.set(filePath, after);
  });

  watcher.on('unlink', (filePath) => {
    const before = preSnapshots.get(filePath) ?? null;
    recordFileEvent(db, {
      sessionId,
      type: 'delete',
      filePath,
      before,
      after: null,
    });
    preSnapshots.delete(filePath);
  });

  // ── Cleanup function ────────────────────────────────────────────
  async function cleanup(exitCode) {
    if (cleaning) return;
    cleaning = true;

    await watcher.close();
    endSession(db, sessionId, exitCode);
    db.close();

    const duration = formatDuration(Date.now() - Date.now()); // will be recalculated
    console.log('');
    console.log(chalk.green(`●  Session ${chalk.bold(sessionId)} ended (exit ${exitCode})`));
    console.log('');
    console.log(chalk.dim('  Review:'));
    console.log(`  ${chalk.cyan(`agentlog diff ${sessionId}`)}`);
    console.log(`  ${chalk.cyan(`agentlog rollback ${sessionId}`)}`);
    console.log('');

    process.exit(exitCode);
  }

  process.on('SIGINT', () => cleanup(0));
  process.on('SIGTERM', () => cleanup(0));

  // ── Phase 3: Spawn agent CLI (if applicable) ───────────────────
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
      console.log(chalk.red(`✖  Failed to spawn "${agentCmd}": ${err.message}`));
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
