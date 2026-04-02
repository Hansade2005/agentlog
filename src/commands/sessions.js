import chalk from 'chalk';
import { openDb, getSessions } from '../db.js';
import { formatRelative, formatDuration, agentLabel } from '../utils.js';

export async function sessionsCommand(options) {
  const cwd = process.cwd();
  const db = openDb(cwd);
  const limit = parseInt(options.limit, 10) || 20;
  const sessions = getSessions(db, limit);
  db.close();

  if (sessions.length === 0) {
    console.log('');
    console.log(chalk.dim('  No sessions recorded yet.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog run <agent>')} to start recording.`));
    console.log('');
    return;
  }

  console.log('');

  // Header
  const header = [
    pad('ID', 10),
    pad('Agent', 14),
    pad('Started', 14),
    pad('Duration', 12),
    pad('Files', 7),
    pad('Cmds', 6),
  ].join('');
  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(63)));

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

    const line = [
      dot + ' ' + pad(chalk.bold(s.id), 9),
      pad(agentLabel(s.agent), 14),
      pad(formatRelative(s.started_at), 14),
      pad(String(duration), 12),
      pad(String(s.file_count), 7),
      pad(String(s.shell_count), 6),
    ].join('');
    console.log(line);
  }

  console.log('');
  console.log(chalk.dim(`  Showing ${sessions.length} session${sessions.length !== 1 ? 's' : ''}.`));
  console.log(chalk.dim(`  Use ${chalk.cyan('agentlog diff <id>')} to see changes.`));
  console.log('');
}

function pad(str, width) {
  const visible = stripAnsi(str);
  const padding = Math.max(0, width - visible.length);
  return str + ' '.repeat(padding);
}

function stripAnsi(str) {
  return str.replace(
    // eslint-disable-next-line no-control-regex
    /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    ''
  );
}
