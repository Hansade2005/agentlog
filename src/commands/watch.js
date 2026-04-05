import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, getSession, getFileEvents, getShellEvents } from '../db.js';
import { isWatcherRunning } from './run.js';
import { agentLabel, formatDuration, formatRelative, shortPath } from '../utils.js';

export async function watchCommand(options) {
  const cwd = process.cwd();
  const running = isWatcherRunning(cwd);

  if (!running) {
    console.log('');
    console.log(chalk.dim('  No active recording session to watch.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog run <agent>')} first.`));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('  LIVE SESSION'));
  console.log(chalk.dim(`  Session: ${running.sessionId}  ·  PID: ${running.pid}  ·  Press Ctrl+C to exit (recording continues)`));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
  console.log('');

  let lastEventCount = 0;

  const poll = async () => {
    try {
      const db = await openDb(cwd);
      const session = getSession(db, running.sessionId);
      if (!session || session.ended_at) {
        db.close();
        console.log(chalk.dim('  Session ended.'));
        process.exit(0);
      }

      const events = getFileEvents(db, session.id);
      db.close();

      if (events.length > lastEventCount) {
        const newEvents = events.slice(lastEventCount);
        for (const e of newEvents) {
          const rel = shortPath(e.file_path, session.cwd);
          const icon = { add: chalk.green('+'), change: chalk.yellow('~'), delete: chalk.red('-') }[e.event_type] || '?';
          const ts = new Date(e.occurred_at).toLocaleTimeString('en-US', { hour12: false });
          const sizeInfo = e.is_binary ? chalk.dim('[binary]') : '';
          console.log(`  ${chalk.dim(ts)}  ${icon}  ${rel}  ${sizeInfo}`);
        }
        lastEventCount = events.length;
      }
    } catch {
      // DB busy or session ended
    }
  };

  // Initial poll
  await poll();

  // Poll every second
  const interval = setInterval(poll, 1000);

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('');
    console.log(chalk.dim('  Stopped watching. Recording continues in background.'));
    console.log('');
    process.exit(0);
  });
}
