import chalk from 'chalk';
import { openDb, getSessions } from '../db.js';
import { formatRelative, formatDuration, agentLabel, pad, truncate } from '../utils.js';

export async function sessionsCommand(options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);

  const limit = parseInt(options.limit, 10);
  const filters = {
    limit: Number.isNaN(limit) ? 20 : limit,
    agent: options.agent || undefined,
    tag: options.tag || undefined,
  };

  const sessions = getSessions(db, filters);
  db.close();

  if (sessions.length === 0) {
    console.log('');
    console.log(chalk.dim('  No sessions recorded yet.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog run <agent>')} to start recording.`));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('  SESSIONS'));
  console.log('');

  // Table header
  const header = [
    '  ',
    pad('ID', 14),
    pad('Agent', 14),
    pad('Started', 14),
    pad('Duration', 11),
    pad('Files', 7),
    pad('Cmds', 6),
    'Tags',
  ].join('');
  console.log(chalk.dim(header));
  console.log(chalk.dim('  ' + '─'.repeat(73)));

  for (const s of sessions) {
    const isActive = s.ended_at == null;
    const isError = s.exit_code != null && s.exit_code !== 0;

    // Status indicator
    let dot, statusColor;
    if (isActive) {
      dot = chalk.yellow('◉');
      statusColor = chalk.yellow;
    } else if (isError) {
      dot = chalk.red('●');
      statusColor = chalk.red;
    } else {
      dot = chalk.green('●');
      statusColor = chalk.white;
    }

    const duration = isActive
      ? chalk.yellow('live')
      : formatDuration(s.ended_at - s.started_at);

    const tags = s.tags
      ? s.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ')
      : '';

    const line = [
      '  ' + dot + ' ',
      pad(chalk.bold(s.id), 14),
      pad(agentLabel(s.agent), 14),
      pad(formatRelative(s.started_at), 14),
      pad(String(duration), 11),
      pad(String(s.file_count), 7),
      pad(String(s.shell_count), 6),
      tags,
    ].join('');
    console.log(line);

    // Show notes if present (indented under the row)
    if (s.notes) {
      console.log(chalk.dim(`      ╰─ ${truncate(s.notes, 65)}`));
    }
  }

  console.log('');
  console.log(chalk.dim(`  ${sessions.length} session(s)  ·  ${chalk.cyan('agentlog diff <id>')}  ·  ${chalk.cyan('agentlog stats')}`));
  console.log('');
}
