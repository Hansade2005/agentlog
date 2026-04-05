import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { openDb, getSessions, pruneSessions } from '../db.js';
import { formatSize, formatNumber } from '../utils.js';

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.toLowerCase().startsWith('y')); });
  });
}

export async function cleanCommand(options) {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (!fs.existsSync(agentlogDir)) {
    console.log(chalk.red('  No .agentlog/ directory found.'));
    process.exit(1);
  }

  const db = await openDb(cwd);
  const dbPath = path.join(agentlogDir, 'sessions.db');
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  const allSessions = getSessions(db, { limit: 99999 });
  const totalEvents = db.get('SELECT COUNT(*) AS count FROM file_events').count;
  const totalShell = db.get('SELECT COUNT(*) AS count FROM shell_events').count;

  console.log('');
  console.log(chalk.bold.cyan('  DATABASE INFO'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));
  console.log('');
  console.log(`    Database size:    ${chalk.cyan(formatSize(dbSize))}`);
  console.log(`    Sessions:         ${chalk.cyan(formatNumber(allSessions.length))}`);
  console.log(`    File events:      ${chalk.cyan(formatNumber(totalEvents))}`);
  console.log(`    Shell events:     ${chalk.cyan(formatNumber(totalShell))}`);
  console.log('');

  const keep = parseInt(options.keep, 10);
  if (!Number.isNaN(keep) && keep > 0) {
    const wouldPrune = Math.max(0, allSessions.length - keep);
    if (wouldPrune === 0) {
      console.log(chalk.dim(`  Nothing to prune (${allSessions.length} sessions, keeping ${keep}).`));
    } else {
      console.log(`  Will delete ${chalk.red(String(wouldPrune))} old session(s), keeping most recent ${keep}.`);
      console.log('');

      if (!options.yes) {
        const proceed = await confirm(chalk.yellow('  Proceed? [y/N] '));
        if (!proceed) { db.close(); console.log(chalk.dim('  Cancelled.')); return; }
      }

      const pruned = pruneSessions(db, keep);
      console.log(chalk.green(`  ✔  Pruned ${pruned} session(s).`));

      // Vacuum to reclaim space
      try { db._db.run('VACUUM;'); db._save(); } catch { /* ok */ }

      const newSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
      console.log(chalk.dim(`     ${formatSize(dbSize)} → ${formatSize(newSize)}`));
    }
  } else {
    console.log(chalk.dim('  Usage:'));
    console.log(`  ${chalk.cyan('agentlog clean --keep 20')}        Keep latest 20 sessions`);
    console.log(`  ${chalk.cyan('agentlog clean --keep 20 -y')}     Skip confirmation`);
  }

  console.log('');
  db.close();
}
