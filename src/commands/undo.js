import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { openDb, getSessions, getFileEvents, resolveSession } from '../db.js';
import { shortPath, agentLabel, formatRelative } from '../utils.js';

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.toLowerCase().startsWith('y')); });
  });
}

export async function undoCommand(options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);

  // Find the most recent completed session
  const sessions = getSessions(db, { limit: 1 });

  if (sessions.length === 0) {
    db.close();
    console.log('');
    console.log(chalk.dim('  No sessions to undo.'));
    console.log('');
    return;
  }

  const session = sessions[0];

  if (session.ended_at == null) {
    db.close();
    console.log('');
    console.log(chalk.yellow(`  Latest session ${chalk.bold(session.id)} is still active.`));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog stop')} first, then ${chalk.cyan('agentlog undo')}.`));
    console.log('');
    return;
  }

  const fileEvents = getFileEvents(db, session.id);
  db.close();

  if (fileEvents.length === 0) {
    console.log('');
    console.log(chalk.dim('  Last session has no file changes to undo.'));
    console.log('');
    return;
  }

  // Build first-event-per-file map
  const firstEventByFile = new Map();
  for (const evt of fileEvents) {
    if (!firstEventByFile.has(evt.file_path)) {
      firstEventByFile.set(evt.file_path, evt);
    }
  }

  // Build actions
  const actions = [];
  for (const [filePath, evt] of firstEventByFile) {
    const rel = shortPath(filePath, session.cwd);
    if (evt.event_type === 'add') {
      actions.push({ type: 'delete', filePath, rel });
    } else if (evt.snapshot_before != null) {
      actions.push({ type: 'restore', filePath, rel, content: evt.snapshot_before });
    }
  }

  if (actions.length === 0) {
    console.log('');
    console.log(chalk.dim('  Nothing to undo.'));
    console.log('');
    return;
  }

  const tags = session.tags ? '  ' + session.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ') : '';
  console.log('');
  console.log(chalk.bold.cyan('  UNDO LAST SESSION'));
  console.log('');
  console.log(`  ${chalk.bold(session.id)}  ${agentLabel(session.agent)}  ${chalk.dim(formatRelative(session.started_at))}${tags}`);
  if (session.notes) console.log(chalk.dim(`  "${session.notes}"`));
  console.log('');

  for (const a of actions) {
    if (a.type === 'delete') console.log(`  ${chalk.red('✕')}  ${chalk.red('delete')}   ${a.rel}`);
    else console.log(`  ${chalk.green('↺')}  ${chalk.green('restore')}  ${a.rel}`);
  }

  console.log('');

  if (!options.yes) {
    const proceed = await confirm(chalk.yellow(`  Undo ${actions.length} file(s)? [y/N] `));
    if (!proceed) {
      console.log(chalk.dim('  Cancelled.'));
      return;
    }
  }

  let success = 0;
  for (const a of actions) {
    try {
      if (a.type === 'delete') {
        if (fs.existsSync(a.filePath)) fs.unlinkSync(a.filePath);
      } else {
        fs.mkdirSync(path.dirname(a.filePath), { recursive: true });
        fs.writeFileSync(a.filePath, a.content, 'utf8');
      }
      success++;
    } catch { /* skip failed */ }
  }

  console.log(chalk.green(`  ✔  Undone — ${success} file(s) restored`));
  console.log('');
}
