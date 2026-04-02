import chalk from 'chalk';
import { openDb, getSessions } from '../db.js';
import { formatRelative, formatDuration, agentLabel, pad } from '../utils.js';

export async function sessionsCommand(options) {
  const cwd = process.cwd();
  const db = openDb(cwd);

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

  const header = [
    pad('', 2),
    pad('ID', 14),
    pad('Agent', 14),
    pad('Started', 14),
    pad('Duration', 12),
    pad('Files', 7),
    pad('Cmds', 6),
    'Tags',
  ].join('');
  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(75)));

  for (const s of sessions) {
    const isActive = s.ended_at == null;
    const isError = s.exit_code != null && s.exit_code !== 0;
    const dot = isActive
      ? chalk.yellow('●')
      : isError
        ? chalk.red('●')
        : chalk.green('●');

    const duration = isActive
      ? chalk.yellow('live')
      : formatDuration(s.ended_at - s.started_at);

    const tags = s.tags ? chalk.dim(s.tags) : '';

    const line = [
      dot + ' ',
      pad(chalk.bold(s.id), 14),
      pad(agentLabel(s.agent), 14),
      pad(formatRelative(s.started_at), 14),
      pad(String(duration), 12),
      pad(String(s.file_count), 7),
      pad(String(s.shell_count), 6),
      tags,
    ].join('');
    console.log(line);

    // Show notes if present
    if (s.notes) {
      console.log(chalk.dim(`     ${s.notes}`));
    }
  }

  console.log('');
  console.log(chalk.dim(`  ${sessions.length} session(s) shown.`));
  console.log(chalk.dim(`  ${chalk.cyan('agentlog diff <id>')} to see changes  |  ${chalk.cyan('agentlog stats')} for analytics`));
  console.log('');
}
