import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { openDb, endSession, getSession } from '../db.js';
import { isWatcherRunning } from './run.js';
import { formatDuration } from '../utils.js';

export async function stopCommand() {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (!fs.existsSync(agentlogDir)) {
    console.log(chalk.red('  No .agentlog/ directory found.'));
    process.exit(1);
  }

  const info = isWatcherRunning(cwd);

  if (!info) {
    console.log('');
    console.log(chalk.dim('  No active recording session in this directory.'));
    console.log('');
    return;
  }

  // Send SIGTERM to the background watcher
  try {
    process.kill(info.pid, 'SIGTERM');
  } catch {
    // Process already dead — clean up
  }

  // Wait briefly for it to clean up
  await new Promise((r) => setTimeout(r, 500));

  // If session is still open in DB, close it
  const db = await openDb(cwd);
  const session = getSession(db, info.sessionId);
  if (session && !session.ended_at) {
    endSession(db, info.sessionId, 0);
  }
  db.close();

  // Remove pid file
  const pidFile = path.join(agentlogDir, 'watcher.pid');
  try { fs.unlinkSync(pidFile); } catch { /* already removed */ }

  const duration = session
    ? formatDuration(Date.now() - session.started_at)
    : '';

  console.log('');
  console.log(chalk.green(`  Session ${chalk.bold(info.sessionId)} stopped`));
  if (duration) console.log(chalk.dim(`   Duration: ${duration}`));
  console.log('');
  console.log(chalk.dim('  Review:'));
  console.log(`  ${chalk.cyan(`agentlog diff ${info.sessionId}`)}`);
  console.log(`  ${chalk.cyan(`agentlog rollback ${info.sessionId}`)}`);
  console.log('');
}
