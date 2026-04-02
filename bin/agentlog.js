#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initCommand } from '../src/commands/init.js';
import { runCommand } from '../src/commands/run.js';
import { sessionsCommand } from '../src/commands/sessions.js';
import { diffCommand } from '../src/commands/diff.js';
import { rollbackCommand } from '../src/commands/rollback.js';
import { queryCommand } from '../src/commands/query.js';
import { exportCommand } from '../src/commands/export.js';
import { statsCommand } from '../src/commands/stats.js';
import { tagCommand } from '../src/commands/tag.js';
import { stopCommand } from '../src/commands/stop.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('agentlog')
  .description('Record, query, diff, and rollback AI coding agent sessions.')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize AgentLog in the current directory')
  .action(initCommand);

program
  .command('run <agent>')
  .description('Start recording a session (cursor, claude-code, codex, windsurf, copilot, cline, aider, custom)')
  .option('-a, --args <args>', 'Arguments to pass to the agent CLI')
  .option('-t, --tag <tags...>', 'Tag this session (e.g. --tag bugfix auth)')
  .option('--force', 'Start even if another session is active')
  .option('--foreground', 'Run watcher in foreground (default for CLI agents)')
  .action(runCommand);

program
  .command('stop')
  .description('Stop the background recording session')
  .action(stopCommand);

program
  .command('sessions')
  .alias('ls')
  .description('List recorded sessions')
  .option('-l, --limit <n>', 'Number of sessions to show', '20')
  .option('-a, --agent <agent>', 'Filter by agent type')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action(sessionsCommand);

program
  .command('diff <session-id>')
  .description('Show file changes for a session')
  .option('-p, --patch', 'Show full unified diff')
  .option('-c, --compare <session-id>', 'Compare with another session')
  .action(diffCommand);

program
  .command('rollback <session-id>')
  .description('Rollback all changes from a session')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(rollbackCommand);

program
  .command('query <question>')
  .description('Ask AI about your sessions')
  .action(queryCommand);

program
  .command('export <session-id>')
  .description('Export session data (json, md, patch)')
  .option('-f, --format <format>', 'Output format: json, md, patch', 'json')
  .option('-o, --output <file>', 'Write to file instead of stdout')
  .action(exportCommand);

program
  .command('stats')
  .description('Show analytics and statistics')
  .action(statsCommand);

program
  .command('tag <session-id>')
  .description('Add tags or notes to a session')
  .option('--add <tags...>', 'Add tags')
  .option('--remove <tags...>', 'Remove tags')
  .option('--note <text>', 'Set session note')
  .action(tagCommand);

program.parse();
