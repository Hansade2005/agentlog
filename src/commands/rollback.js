import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import chalk from 'chalk';
import { openDb, resolveSession, getFileEvents } from '../db.js';
import { shortPath, agentLabel, formatTime } from '../utils.js';

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

export async function rollbackCommand(sessionId, options) {
  const cwd = process.cwd();
  const db = openDb(cwd);

  const session = resolveSession(db, sessionId);
  if (session.error) {
    console.log(chalk.red(`  ${session.error}`));
    db.close();
    process.exit(1);
  }

  const fileEvents = getFileEvents(db, session.id);
  db.close();

  if (fileEvents.length === 0) {
    console.log('');
    console.log(chalk.dim('  No file changes recorded for this session. Nothing to rollback.'));
    console.log('');
    return;
  }

  // Build first-event-per-file map (pre-session state)
  const firstEventByFile = new Map();
  for (const evt of fileEvents) {
    if (!firstEventByFile.has(evt.file_path)) {
      firstEventByFile.set(evt.file_path, evt);
    }
  }

  const actions = [];
  for (const [filePath, evt] of firstEventByFile) {
    const rel = shortPath(filePath, session.cwd);

    if (evt.event_type === 'add') {
      actions.push({ type: 'delete', filePath, rel });
    } else if (evt.event_type === 'delete' && evt.snapshot_before != null) {
      actions.push({ type: 'restore', filePath, rel, content: evt.snapshot_before });
    } else if (evt.event_type === 'change' && evt.snapshot_before != null) {
      actions.push({ type: 'restore', filePath, rel, content: evt.snapshot_before });
    } else if (evt.is_binary) {
      actions.push({ type: 'skip', filePath, rel, reason: 'binary file — manual restore needed' });
    } else {
      actions.push({ type: 'skip', filePath, rel, reason: 'no pre-session snapshot available' });
    }
  }

  console.log('');
  console.log(chalk.bold.cyan('  ROLLBACK'));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
  console.log('');
  console.log(`  ${chalk.bold(session.id)}  ${chalk.dim('·')}  ${agentLabel(session.agent)}  ${chalk.dim('·')}  ${formatTime(session.started_at)}`);
  console.log('');

  const actionable = actions.filter((a) => a.type !== 'skip');
  const skipped = actions.filter((a) => a.type === 'skip');

  console.log(chalk.bold('  Planned Actions'));
  console.log('');
  for (const a of actionable) {
    if (a.type === 'delete') {
      console.log(`  ${chalk.red('✕')}  ${chalk.red('delete')}   ${a.rel}`);
    } else {
      console.log(`  ${chalk.green('↺')}  ${chalk.green('restore')}  ${a.rel}`);
    }
  }
  for (const a of skipped) {
    console.log(`  ${chalk.dim('·')}  ${chalk.dim('skip')}     ${a.rel}  ${chalk.dim(`(${a.reason})`)}`);
  }

  if (actionable.length === 0) {
    console.log('');
    console.log(chalk.dim('  Nothing to rollback (all changes skipped).'));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.dim(`  ${actionable.length} file(s) will be affected.`));
  console.log('');

  if (!options.yes) {
    const proceed = await confirm(chalk.yellow('  Proceed with rollback? [y/N] '));
    if (!proceed) {
      console.log(chalk.dim('  Rollback cancelled.'));
      return;
    }
  }

  let success = 0, failed = 0;

  for (const a of actionable) {
    try {
      if (a.type === 'delete') {
        if (fs.existsSync(a.filePath)) fs.unlinkSync(a.filePath);
        console.log(`  ${chalk.green('✔')} deleted  ${a.rel}`);
        success++;
      } else if (a.type === 'restore') {
        fs.mkdirSync(path.dirname(a.filePath), { recursive: true });
        fs.writeFileSync(a.filePath, a.content, 'utf8');
        console.log(`  ${chalk.green('✔')} restored ${a.rel}`);
        success++;
      }
    } catch (err) {
      console.log(`  ${chalk.red('✖')} ${a.rel}: ${err.message}`);
      failed++;
    }
  }

  console.log('');
  const parts = [`${chalk.green(success + ' succeeded')}`];
  if (failed > 0) parts.push(`${chalk.red(failed + ' failed')}`);
  if (skipped.length > 0) parts.push(`${chalk.dim(skipped.length + ' skipped')}`);
  console.log(`  ${parts.join(', ')}`);
  console.log('');
}
