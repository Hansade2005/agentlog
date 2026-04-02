import chalk from 'chalk';
import { openDb, resolveSession, updateSessionTags, updateSessionNotes } from '../db.js';

export async function tagCommand(sessionId, options) {
  const cwd = process.cwd();
  const db = openDb(cwd);

  const session = resolveSession(db, sessionId);
  if (session.error) {
    console.log(chalk.red(`  ${session.error}`));
    db.close();
    process.exit(1);
  }

  let changed = false;

  // Handle tags
  if (options.add) {
    const existing = session.tags ? session.tags.split(',').filter(Boolean) : [];
    for (const t of options.add) {
      if (!existing.includes(t)) existing.push(t);
    }
    updateSessionTags(db, session.id, existing.join(','));
    console.log(chalk.green(`  Tags updated: ${existing.join(', ')}`));
    changed = true;
  }

  if (options.remove) {
    const existing = session.tags ? session.tags.split(',').filter(Boolean) : [];
    const filtered = existing.filter((t) => !options.remove.includes(t));
    updateSessionTags(db, session.id, filtered.join(','));
    console.log(chalk.green(`  Tags updated: ${filtered.join(', ') || '(none)'}`));
    changed = true;
  }

  // Handle notes
  if (options.note !== undefined) {
    updateSessionNotes(db, session.id, options.note);
    console.log(chalk.green(`  Note ${options.note ? 'updated' : 'cleared'}.`));
    changed = true;
  }

  if (!changed) {
    // Display current tags and notes
    console.log('');
    console.log(chalk.bold(`Session ${session.id}`));
    console.log(`  Tags:  ${session.tags || chalk.dim('(none)')}`);
    console.log(`  Notes: ${session.notes || chalk.dim('(none)')}`);
    console.log('');
    console.log(chalk.dim('  Usage:'));
    console.log(`  ${chalk.cyan(`agentlog tag ${session.id} --add bugfix`)}        Add a tag`);
    console.log(`  ${chalk.cyan(`agentlog tag ${session.id} --remove bugfix`)}     Remove a tag`);
    console.log(`  ${chalk.cyan(`agentlog tag ${session.id} --note "fixed auth"`)} Set a note`);
    console.log('');
  }

  db.close();
}
