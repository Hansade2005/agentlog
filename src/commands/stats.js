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
  console.log(chalk.bold('  AgentLog Analytics'));
  console.log(chalk.dim('  ─'.repeat(30)));
  console.log('');

  // Overview
  console.log(chalk.bold('  Overview'));
  console.log(`    Sessions:        ${chalk.cyan(formatNumber(stats.totalSessions))}`);
  console.log(`    File events:     ${chalk.cyan(formatNumber(stats.totalFileEvents))}`);
  console.log(`    Shell commands:  ${chalk.cyan(formatNumber(stats.totalShellEvents))}`);
  console.log(`    Total data:      ${chalk.cyan(formatSize(stats.totalSize))}`);
  console.log(`    Binary files:    ${chalk.cyan(formatNumber(stats.binaryCount))}`);
  if (stats.avgDuration) {
    console.log(`    Avg duration:    ${chalk.cyan(formatDuration(stats.avgDuration))}`);
  }
  if (stats.firstSession) {
    console.log(`    First session:   ${chalk.dim(formatRelative(stats.firstSession))}`);
  }
  if (stats.lastSession) {
    console.log(`    Latest session:  ${chalk.dim(formatRelative(stats.lastSession))}`);
  }
  console.log('');

  // Events by type
  if (stats.eventsByType.length > 0) {
    console.log(chalk.bold('  Event Breakdown'));
    for (const e of stats.eventsByType) {
      const color = e.event_type === 'add' ? chalk.green : e.event_type === 'delete' ? chalk.red : chalk.yellow;
      const bar = '█'.repeat(Math.min(40, Math.round((e.count / stats.totalFileEvents) * 40)));
      console.log(`    ${pad(color(e.event_type), 10)} ${color(bar)} ${e.count}`);
    }
    console.log('');
  }

  // Agents
  if (stats.agents.length > 0) {
    console.log(chalk.bold('  Agents'));
    for (const a of stats.agents) {
      const bar = '█'.repeat(Math.min(40, Math.round((a.count / stats.totalSessions) * 40)));
      console.log(`    ${pad(agentLabel(a.agent), 14)} ${chalk.cyan(bar)} ${a.count}`);
    }
    console.log('');
  }

  // Hot files
  if (stats.topFiles.length > 0) {
    console.log(chalk.bold('  Most Changed Files'));
    for (const f of stats.topFiles) {
      const rel = shortPath(f.file_path, cwd);
      console.log(`    ${chalk.cyan(pad(String(f.count), 5))} ${rel}`);
    }
    console.log('');
  }
}
