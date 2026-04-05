import chalk from 'chalk';
import { openDb, getSessions, getFileEvents, getShellEvents } from '../db.js';
import { agentLabel, formatRelative, formatDuration, shortPath, pad } from '../utils.js';

export async function logCommand(options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);

  const limit = parseInt(options.limit, 10);
  const sessions = getSessions(db, {
    limit: Number.isNaN(limit) ? 10 : limit,
    agent: options.agent || undefined,
    tag: options.tag || undefined,
  });

  if (sessions.length === 0) {
    db.close();
    console.log('');
    console.log(chalk.dim('  No sessions recorded yet.'));
    console.log('');
    return;
  }

  console.log('');

  for (const s of sessions) {
    const fileEvents = getFileEvents(db, s.id);
    const shellEvents = getShellEvents(db, s.id);

    const isActive = s.ended_at == null;
    const isError = s.exit_code != null && s.exit_code !== 0;
    const dot = isActive ? chalk.yellow('◉') : isError ? chalk.red('●') : chalk.green('●');

    const duration = isActive ? chalk.yellow('live') : formatDuration(s.ended_at - s.started_at);
    const tags = s.tags ? '  ' + s.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ') : '';

    // Header
    console.log(`  ${dot} ${chalk.bold.yellow(s.id)}  ${agentLabel(s.agent)}  ${chalk.dim(formatRelative(s.started_at))}  ${duration}${tags}`);

    if (s.notes) {
      console.log(chalk.dim(`    "${s.notes}"`));
    }

    // Group files by type
    const fileMap = new Map();
    for (const e of fileEvents) fileMap.set(e.file_path, e);

    let adds = 0, changes = 0, deletes = 0;
    for (const [, e] of fileMap) {
      if (e.event_type === 'add') adds++;
      else if (e.event_type === 'change') changes++;
      else deletes++;
    }

    // File summary line
    const parts = [];
    if (adds > 0) parts.push(chalk.green(`+${adds}`));
    if (changes > 0) parts.push(chalk.yellow(`~${changes}`));
    if (deletes > 0) parts.push(chalk.red(`-${deletes}`));

    if (parts.length > 0) {
      console.log(`    ${parts.join(' ')}  ${chalk.dim(`(${fileMap.size} files)`)}`);
    }

    // Show files (compact)
    if (!options.compact) {
      const show = [...fileMap.entries()].slice(0, 8);
      for (const [fp, e] of show) {
        const rel = shortPath(fp, s.cwd);
        const icon = { add: chalk.green('+'), change: chalk.yellow('~'), delete: chalk.red('-') }[e.event_type] || ' ';
        console.log(chalk.dim(`    ${icon} ${rel}`));
      }
      if (fileMap.size > 8) {
        console.log(chalk.dim(`    ... and ${fileMap.size - 8} more`));
      }
    }

    // Shell commands
    if (shellEvents.length > 0 && !options.compact) {
      for (const cmd of shellEvents.slice(0, 3)) {
        console.log(chalk.dim(`    ${chalk.cyan('$')} ${cmd.command}`));
      }
    }

    console.log('');
  }

  db.close();
}
