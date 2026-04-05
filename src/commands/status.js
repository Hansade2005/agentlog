import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, getSession, getFileEvents, getShellEvents } from '../db.js';
import { isWatcherRunning } from './run.js';
import { agentLabel, formatDuration, formatRelative, shortPath, pad } from '../utils.js';

export async function statusCommand() {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (!fs.existsSync(agentlogDir)) {
    console.log('');
    console.log(chalk.dim('  AgentLog is not initialized in this directory.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog init')} to get started.`));
    console.log('');
    return;
  }

  const running = isWatcherRunning(cwd);

  if (!running) {
    console.log('');
    console.log(chalk.dim('  ○  No active recording session.'));
    console.log(chalk.dim(`     Run ${chalk.cyan('agentlog run <agent>')} to start.`));
    console.log('');
    return;
  }

  const db = await openDb(cwd);
  const session = getSession(db, running.sessionId);

  if (!session) {
    db.close();
    console.log('');
    console.log(chalk.yellow('  ⚠  Stale watcher detected (session not found in DB).'));
    console.log(chalk.dim(`     Run ${chalk.cyan('agentlog stop')} to clean up.`));
    console.log('');
    return;
  }

  const fileEvents = getFileEvents(db, session.id);
  const shellEvents = getShellEvents(db, session.id);
  db.close();

  const elapsed = Date.now() - session.started_at;
  const tags = session.tags ? session.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ') : '';

  // Count by type
  let adds = 0, changes = 0, deletes = 0;
  const files = new Set();
  for (const e of fileEvents) {
    files.add(e.file_path);
    if (e.event_type === 'add') adds++;
    else if (e.event_type === 'change') changes++;
    else if (e.event_type === 'delete') deletes++;
  }

  console.log('');
  console.log(chalk.green(`  ◉  Recording — ${chalk.bold(session.id)}`));
  console.log('');
  console.log(`    Agent:       ${agentLabel(session.agent)}`);
  console.log(`    Duration:    ${chalk.cyan(formatDuration(elapsed))}`);
  console.log(`    PID:         ${running.pid}`);
  if (tags) console.log(`    Tags:        ${tags}`);
  console.log('');
  console.log(`    File events: ${chalk.cyan(String(fileEvents.length))} (${chalk.green('+' + adds)} ${chalk.yellow('~' + changes)} ${chalk.red('-' + deletes)})`);
  console.log(`    Files touched: ${chalk.cyan(String(files.size))}`);
  console.log(`    Commands:    ${chalk.cyan(String(shellEvents.length))}`);

  // Show last 5 events
  if (fileEvents.length > 0) {
    console.log('');
    console.log(chalk.bold('    Recent Activity'));
    const recent = fileEvents.slice(-5);
    for (const e of recent) {
      const rel = shortPath(e.file_path, session.cwd);
      const icon = { add: chalk.green('+'), change: chalk.yellow('~'), delete: chalk.red('-') }[e.event_type] || '?';
      const ago = formatRelative(e.occurred_at);
      console.log(`    ${icon}  ${rel}  ${chalk.dim(ago)}`);
    }
  }

  console.log('');
  console.log(chalk.dim(`    ${chalk.cyan('agentlog stop')} to end  ·  ${chalk.cyan('agentlog watch')} for live view`));
  console.log('');
}
