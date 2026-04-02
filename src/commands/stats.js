import chalk from 'chalk';
import { openDb, getStats } from '../db.js';
import { agentLabel, formatRelative, formatDuration, formatSize, formatNumber, shortPath, pad } from '../utils.js';

export async function statsCommand(options) {
  const cwd = process.cwd();
  const db = openDb(cwd);
  const stats = getStats(db);
  db.close();

  if (stats.totalSessions === 0) {
    console.log('');
    console.log(chalk.dim('  No sessions recorded yet.'));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan('  ANALYTICS'));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
  console.log('');

  // Overview cards
  console.log(chalk.bold('  Overview'));
  console.log('');
  const overviewItems = [
    ['Sessions', formatNumber(stats.totalSessions), chalk.cyan],
    ['File events', formatNumber(stats.totalFileEvents), chalk.yellow],
    ['Commands', formatNumber(stats.totalShellEvents), chalk.green],
    ['Data tracked', formatSize(stats.totalSize), chalk.magenta],
    ['Binary files', formatNumber(stats.binaryCount), chalk.dim],
  ];
  for (const [label, value, color] of overviewItems) {
    console.log(`    ${pad(label, 16)} ${color(value)}`);
  }
  if (stats.avgDuration) {
    console.log(`    ${pad('Avg duration', 16)} ${chalk.cyan(formatDuration(stats.avgDuration))}`);
  }
  if (stats.firstSession) {
    console.log(`    ${pad('First session', 16)} ${chalk.dim(formatRelative(stats.firstSession))}`);
  }
  if (stats.lastSession) {
    console.log(`    ${pad('Last session', 16)} ${chalk.dim(formatRelative(stats.lastSession))}`);
  }
  console.log('');

  // Event breakdown with percentage bars
  if (stats.eventsByType.length > 0) {
    console.log(chalk.bold('  Event Breakdown'));
    console.log('');
    for (const e of stats.eventsByType) {
      const color = e.event_type === 'add' ? chalk.green : e.event_type === 'delete' ? chalk.red : chalk.yellow;
      const pct = ((e.count / stats.totalFileEvents) * 100).toFixed(0);
      const barLen = Math.max(1, Math.round((e.count / stats.totalFileEvents) * 30));
      const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
      console.log(`    ${pad(color(e.event_type), 12)} ${color(bar)}  ${pad(String(e.count), 5)} ${chalk.dim(`(${pct}%)`)}`);
    }
    console.log('');
  }

  // Agent breakdown
  if (stats.agents.length > 0) {
    console.log(chalk.bold('  Agents'));
    console.log('');
    for (const a of stats.agents) {
      const pct = ((a.count / stats.totalSessions) * 100).toFixed(0);
      const barLen = Math.max(1, Math.round((a.count / stats.totalSessions) * 30));
      const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
      console.log(`    ${pad(agentLabel(a.agent), 14)} ${chalk.cyan(bar)}  ${pad(String(a.count), 5)} ${chalk.dim(`(${pct}%)`)}`);
    }
    console.log('');
  }

  // Hot files
  if (stats.topFiles.length > 0) {
    console.log(chalk.bold('  Most Changed Files'));
    console.log('');
    const maxCount = stats.topFiles[0].count;
    for (let i = 0; i < stats.topFiles.length; i++) {
      const f = stats.topFiles[i];
      const rel = shortPath(f.file_path, cwd);
      const barLen = Math.max(1, Math.round((f.count / maxCount) * 20));
      const bar = chalk.cyan('▇'.repeat(barLen));
      const rank = chalk.dim(`${i + 1}.`);
      console.log(`    ${pad(rank, 4)} ${bar} ${pad(String(f.count), 4)} ${rel}`);
    }
    console.log('');
  }
}
