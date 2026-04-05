#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initCommand } from '../src/commands/init.js';
import { runCommand } from '../src/commands/run.js';
import { stopCommand } from '../src/commands/stop.js';
import { statusCommand } from '../src/commands/status.js';
import { sessionsCommand } from '../src/commands/sessions.js';
import { logCommand } from '../src/commands/log.js';
import { diffCommand } from '../src/commands/diff.js';
import { rollbackCommand } from '../src/commands/rollback.js';
import { undoCommand } from '../src/commands/undo.js';
import { queryCommand } from '../src/commands/query.js';
import { searchCommand } from '../src/commands/search.js';
import { watchCommand } from '../src/commands/watch.js';
import { exportCommand } from '../src/commands/export.js';
import { statsCommand } from '../src/commands/stats.js';
import { tagCommand } from '../src/commands/tag.js';
import { cleanCommand } from '../src/commands/clean.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

program
  .name('agentlog')
  .description('Record, query, diff, and rollback AI coding agent sessions.')
  .version(pkg.version);

// ─── Recording ───────────────────────────────────────────────────

program
  .command('init')
  .description('Initialize AgentLog in the current directory')
  .action(initCommand);

program
  .command('run <agent>')
  .description('Start recording (cursor, claude-code, codex, windsurf, copilot, cline, aider, custom)')
  .option('-a, --args <args>', 'Arguments to pass to the agent CLI')
  .option('-t, --tag <tags...>', 'Tag the session (e.g. --tag bugfix auth)')
  .option('--force', 'Start even if another session is active')
  .option('--foreground', 'Run watcher in foreground')
  .action(runCommand);

program
  .command('stop')
  .description('Stop the active recording session')
  .action(stopCommand);

program
  .command('status')
  .description('Check if a session is recording + live summary')
  .action(statusCommand);

program
  .command('watch')
  .description('Live tail of current session activity')
  .action(watchCommand);

// ─── Browsing ────────────────────────────────────────────────────

program
  .command('sessions')
  .alias('ls')
  .description('List sessions (table view)')
  .option('-l, --limit <n>', 'Number of sessions', '20')
  .option('-a, --agent <agent>', 'Filter by agent')
  .option('-t, --tag <tag>', 'Filter by tag')
  .action(sessionsCommand);

program
  .command('log')
  .description('Git-log-style session history with file details')
  .option('-l, --limit <n>', 'Number of sessions', '10')
  .option('-a, --agent <agent>', 'Filter by agent')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('-c, --compact', 'Compact mode (no file listing)')
  .action(logCommand);

program
  .command('search [pattern]')
  .description('Find sessions by file pattern (e.g. "*.js", "auth")')
  .option('--min-files <n>', 'Sessions with at least N files changed')
  .option('-a, --agent <agent>', 'Filter by agent')
  .action(searchCommand);

// ─── Inspection ──────────────────────────────────────────────────

program
  .command('diff <session-id>')
  .description('Show file changes for a session')
  .option('-p, --patch', 'Full unified diff')
  .option('-c, --compare <session-id>', 'Compare with another session')
  .action(diffCommand);

program
  .command('stats')
  .description('Analytics dashboard')
  .action(statsCommand);

program
  .command('query <question>')
  .description('Ask AI about your sessions')
  .action(queryCommand);

// ─── Actions ─────────────────────────────────────────────────────

program
  .command('rollback <session-id>')
  .description('Rollback changes from a session')
  .option('-y, --yes', 'Skip confirmation')
  .option('-f, --files <files...>', 'Rollback specific files only')
  .action(rollbackCommand);

program
  .command('undo')
  .description('Quick undo of the last session (no ID needed)')
  .option('-y, --yes', 'Skip confirmation')
  .action(undoCommand);

program
  .command('export <session-id>')
  .description('Export session data (json, md, patch)')
  .option('-f, --format <format>', 'Output format', 'json')
  .option('-o, --output <file>', 'Write to file')
  .action(exportCommand);

program
  .command('tag <session-id>')
  .description('Add tags or notes to a session')
  .option('--add <tags...>', 'Add tags')
  .option('--remove <tags...>', 'Remove tags')
  .option('--note <text>', 'Set session note')
  .action(tagCommand);

// ─── Maintenance ─────────────────────────────────────────────────

program
  .command('clean')
  .description('Prune old sessions and reclaim disk space')
  .option('-k, --keep <n>', 'Keep the latest N sessions')
  .option('-y, --yes', 'Skip confirmation')
  .action(cleanCommand);

program.parse();
