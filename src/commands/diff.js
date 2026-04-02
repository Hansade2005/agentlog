import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import { openDb, resolveSession, getFileEvents, getShellEvents } from '../db.js';
import { shortPath, formatTime, agentLabel, formatDuration } from '../utils.js';

/**
 * Render a unified diff with colors.
 */
function renderDiff(before, after, filePath) {
  const patch = createTwoFilesPatch(
    filePath,
    filePath,
    before || '',
    after || '',
    'before',
    'after'
  );

  const lines = patch.split('\n');
  // Skip the first 2 header lines (Index, ===)
  const body = lines.slice(2);
  const output = [];

  for (const line of body) {
    if (line.startsWith('@@')) {
      output.push(chalk.cyan(line));
    } else if (line.startsWith('+')) {
      output.push(chalk.green(line));
    } else if (line.startsWith('-')) {
      output.push(chalk.red(line));
    } else {
      output.push(chalk.dim(line));
    }
  }

  return output.join('\n');
}

export async function diffCommand(sessionId, options) {
  const cwd = process.cwd();
  const db = openDb(cwd);

  const session = resolveSession(db, sessionId);
  if (session.error) {
    console.log(chalk.red(`✖  ${session.error}`));
    db.close();
    process.exit(1);
  }

  const fileEvents = getFileEvents(db, session.id);
  const shellEvents = getShellEvents(db, session.id);
  db.close();

  if (fileEvents.length === 0 && shellEvents.length === 0) {
    console.log('');
    console.log(chalk.dim('  No changes recorded for this session.'));
    console.log('');
    return;
  }

  // Group by file path — last event per file wins for summary
  const fileMap = new Map();
  for (const evt of fileEvents) {
    fileMap.set(evt.file_path, evt);
  }

  // Count stats
  let added = 0;
  let modified = 0;
  let deleted = 0;

  console.log('');
  console.log(
    chalk.bold(`Session ${session.id}`) +
      chalk.dim(` — ${agentLabel(session.agent)} — ${formatTime(session.started_at)}`)
  );

  const duration =
    session.ended_at != null
      ? formatDuration(session.ended_at - session.started_at)
      : 'ongoing';
  console.log(chalk.dim(`Duration: ${duration}  |  Files: ${fileEvents.length} events  |  Commands: ${shellEvents.length}`));
  console.log('');

  // ── File changes ────────────────────────────────────────────────
  if (fileMap.size > 0) {
    console.log(chalk.bold('  Files:'));
    console.log('');

    for (const [filePath, evt] of fileMap) {
      const rel = shortPath(filePath, session.cwd);
      const before = evt.snapshot_before || '';
      const after = evt.snapshot_after || '';

      const addedLines = after ? after.split('\n').length : 0;
      const removedLines = before ? before.split('\n').length : 0;

      let label;
      let stats;

      if (evt.event_type === 'add') {
        label = chalk.green('new');
        stats = chalk.green(`+${addedLines}`);
        added++;
      } else if (evt.event_type === 'delete') {
        label = chalk.red('del');
        stats = chalk.red(`-${removedLines}`);
        deleted++;
      } else {
        label = chalk.yellow('mod');
        // Calculate actual diff lines
        const patch = createTwoFilesPatch('a', 'b', before, after);
        const diffLines = patch.split('\n');
        let plus = 0;
        let minus = 0;
        for (const l of diffLines) {
          if (l.startsWith('+') && !l.startsWith('+++')) plus++;
          if (l.startsWith('-') && !l.startsWith('---')) minus++;
        }
        stats = `${chalk.green('+' + plus)} ${chalk.red('-' + minus)}`;
        modified++;
      }

      console.log(`  ${label}  ${rel}  ${stats}`);

      if (options.patch) {
        const diffOutput = renderDiff(
          evt.snapshot_before,
          evt.snapshot_after,
          rel
        );
        if (diffOutput.trim()) {
          console.log('');
          for (const line of diffOutput.split('\n')) {
            console.log('    ' + line);
          }
          console.log('');
        }
      }
    }
    console.log('');
  }

  // ── Summary ─────────────────────────────────────────────────────
  const parts = [];
  if (added > 0) parts.push(chalk.green(`${added} new`));
  if (modified > 0) parts.push(chalk.yellow(`${modified} modified`));
  if (deleted > 0) parts.push(chalk.red(`${deleted} deleted`));
  if (parts.length > 0) {
    console.log(chalk.dim(`  Summary: ${parts.join(', ')}`));
  }

  // ── Shell commands ──────────────────────────────────────────────
  if (shellEvents.length > 0) {
    console.log('');
    console.log(chalk.bold('  Commands:'));
    console.log('');
    for (const cmd of shellEvents) {
      console.log(`  ${chalk.dim(formatTime(cmd.occurred_at))}  ${chalk.cyan(cmd.command)}`);
    }
  }

  console.log('');
  console.log(chalk.dim(`  Rollback: ${chalk.cyan(`agentlog rollback ${session.id}`)}`));
  console.log('');
}
