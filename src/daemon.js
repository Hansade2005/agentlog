/**
 * Background watcher daemon — spawned by `agentlog run` for GUI agents.
 * Reads config from env vars set by the parent process.
 */
import fs from 'node:fs';
import path from 'node:path';
import chokidar from 'chokidar';
import {
  openDb, endSession, recordFileEvent, pruneSessions,
} from './db.js';
import { isBinaryFile, getFileSize, MAX_SNAPSHOT_SIZE } from './utils.js';

const sessionId = process.env.__AGENTLOG_SESSION_ID__;
const cwd = process.env.__AGENTLOG_CWD__;

if (!sessionId || !cwd) {
  process.exit(1);
}

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

function buildIgnoreFn() {
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

function writePid() {
  fs.writeFileSync(
    path.join(cwd, '.agentlog', 'watcher.pid'),
    JSON.stringify({ pid: process.pid, sessionId }),
    'utf8'
  );
}

function removePid() {
  try { fs.unlinkSync(path.join(cwd, '.agentlog', 'watcher.pid')); } catch { /* ok */ }
}

async function main() {
  const db = await openDb(cwd);
  const ignoreFn = buildIgnoreFn();
  const preSnapshots = new Map();

  writePid();

  // Phase 1: index existing files
  await new Promise((resolve) => {
    const w = chokidar.watch(cwd, {
      ignored: ignoreFn, ignoreInitial: false, persistent: false, followSymlinks: false,
    });
    w.on('add', (fp) => {
      const c = safeRead(fp);
      if (c !== null) preSnapshots.set(fp, c);
    });
    w.on('ready', () => w.close().then(resolve));
  });

  // Phase 2: live watch
  const watcher = chokidar.watch(cwd, {
    ignored: ignoreFn,
    ignoreInitial: true,
    persistent: true,
    followSymlinks: false,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    atomic: 100,
  });

  watcher.on('add', (fp) => {
    const size = getFileSize(fp);
    const binary = isBinaryFile(fp);
    const after = binary ? null : safeRead(fp);
    recordFileEvent(db, { sessionId, type: 'add', filePath: fp, before: null, after, fileSize: size, isBinary: binary });
    if (after !== null) preSnapshots.set(fp, after);
  });

  watcher.on('change', (fp) => {
    const size = getFileSize(fp);
    const binary = isBinaryFile(fp);
    const before = preSnapshots.get(fp) ?? null;
    const after = binary ? null : safeRead(fp);
    recordFileEvent(db, { sessionId, type: 'change', filePath: fp, before, after, fileSize: size, isBinary: binary });
    if (after !== null) preSnapshots.set(fp, after);
  });

  watcher.on('unlink', (fp) => {
    const before = preSnapshots.get(fp) ?? null;
    recordFileEvent(db, { sessionId, type: 'delete', filePath: fp, before, after: null, fileSize: 0, isBinary: false });
    preSnapshots.delete(fp);
  });

  watcher.on('error', () => {});

  async function shutdown() {
    await watcher.close();
    endSession(db, sessionId, 0);
    try {
      const config = JSON.parse(fs.readFileSync(path.join(cwd, '.agentlog', 'config.json'), 'utf8'));
      if (config.maxSessionHistory) pruneSessions(db, config.maxSessionHistory);
    } catch { /* ok */ }
    db.close();
    removePid();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(() => process.exit(1));
