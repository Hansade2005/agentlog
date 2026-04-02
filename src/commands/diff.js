import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import { openDb, resolveSession, getFileEvents, getShellEvents } from '../db.js';
import { shortPath, formatTime, agentLabel, formatDuration, formatSize } from '../utils.js';

function renderDiff(before, after, filePath) {
  const patch = createTwoFilesPatch(filePath, filePath, before || '', after || '', 'before', 'after');
  const lines = patch.split('\n').slice(2);
  const output = [];

  for (const line of lines) {
    if (line.startsWith('@@')) output.push(chalk.cyan(line));
    else if (line.startsWith('+')) output.push(chalk.green(line));
    else if (line.startsWith('-')) output.push(chalk.red(line));
    else output.push(chalk.dim(line));
  }
  return output.join('\n');
}

export async function diffCommand(sessionId, options) {
  const cwd = process.cwd();
  const db = openDb(cwd);

  // Support comparing two sessions
  if (options.compare) {
    return compareSessions(db, sessionId, options.compare, cwd);
  }

  const session = resolveSession(db, sessionId);
  if (session.error) {
    console.log(chalk.red(`  ${session.error}`));
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

  let added = 0, modified = 0, deleted = 0, binaryCount = 0;

  console.log('');
  console.log(
    chalk.bold(`Session ${session.id}`) +
    chalk.dim(` — ${agentLabel(session.agent)} — ${formatTime(session.started_at)}`)
  );
  if (session.tags) console.log(chalk.dim(`Tags: ${session.tags}`));
  if (session.notes) console.log(chalk.dim(`Notes: ${session.notes}`));

  const duration = session.ended_at != null
    ? formatDuration(session.ended_at - session.started_at)
    : 'ongoing';
  console.log(chalk.dim(`Duration: ${duration}  |  ${fileEvents.length} file events  |  ${shellEvents.length} commands`));
  console.log('');

  if (fileMap.size > 0) {
    console.log(chalk.bold('  Files:'));
    console.log('');

    for (const [filePath, evt] of fileMap) {
      const rel = shortPath(filePath, session.cwd);

      if (evt.is_binary) {
        const label = evt.event_type === 'add' ? chalk.green('new') : evt.event_type === 'delete' ? chalk.red('del') : chalk.yellow('mod');
        console.log(`  ${label}  ${rel}  ${chalk.dim(`[binary, ${formatSize(evt.file_size)}]`)}`);
        binaryCount++;
        if (evt.event_type === 'add') added++;
        else if (evt.event_type === 'delete') deleted++;
        else modified++;
        continue;
      }

      const before = evt.snapshot_before || '';
      const after = evt.snapshot_after || '';

      let label, stats;
      if (evt.event_type === 'add') {
        label = chalk.green('new');
        stats = chalk.green(`+${(after.split('\n').length)}`);
        added++;
      } else if (evt.event_type === 'delete') {
        label = chalk.red('del');
        stats = chalk.red(`-${(before.split('\n').length)}`);
        deleted++;
      } else {
        label = chalk.yellow('mod');
        const patch = createTwoFilesPatch('a', 'b', before, after);
        let plus = 0, minus = 0;
        for (const l of patch.split('\n')) {
          if (l.startsWith('+') && !l.startsWith('+++')) plus++;
          if (l.startsWith('-') && !l.startsWith('---')) minus++;
        }
        stats = `${chalk.green('+' + plus)} ${chalk.red('-' + minus)}`;
        modified++;
      }

      console.log(`  ${label}  ${rel}  ${stats}`);

      if (options.patch && !evt.is_binary) {
        const diffOutput = renderDiff(evt.snapshot_before, evt.snapshot_after, rel);
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

  // Summary
  const parts = [];
  if (added > 0) parts.push(chalk.green(`${added} new`));
  if (modified > 0) parts.push(chalk.yellow(`${modified} modified`));
  if (deleted > 0) parts.push(chalk.red(`${deleted} deleted`));
  if (binaryCount > 0) parts.push(chalk.dim(`${binaryCount} binary`));
  if (parts.length > 0) {
    console.log(chalk.dim(`  Summary: ${parts.join(', ')}`));
  }

  // Shell commands
  if (shellEvents.length > 0) {
    console.log('');
    console.log(chalk.bold('  Commands:'));
    console.log('');
    for (const cmd of shellEvents) {
      console.log(`  ${chalk.dim(formatTime(cmd.occurred_at))}  ${chalk.cyan(cmd.command)}`);
    }
  }

  console.log('');
  console.log(chalk.dim(`  ${chalk.cyan(`agentlog rollback ${session.id}`)}  |  ${chalk.cyan(`agentlog export ${session.id}`)}`));
  console.log('');
}

/**
 * Compare two sessions side by side.
 */
function compareSessions(db, idA, idB, cwd) {
  const sessionA = resolveSession(db, idA);
  const sessionB = resolveSession(db, idB);

  if (sessionA.error || sessionB.error) {
    if (sessionA.error) console.log(chalk.red(`  Session A: ${sessionA.error}`));
    if (sessionB.error) console.log(chalk.red(`  Session B: ${sessionB.error}`));
    db.close();
    process.exit(1);
  }

  const filesA = getFileEvents(db, sessionA.id);
  const filesB = getFileEvents(db, sessionB.id);
  db.close();

  // Build final-state maps
  const mapA = new Map();
  for (const e of filesA) mapA.set(e.file_path, e);
  const mapB = new Map();
  for (const e of filesB) mapB.set(e.file_path, e);

  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);

  console.log('');
  console.log(chalk.bold('Session Comparison'));
  console.log(`  A: ${chalk.cyan(sessionA.id)} (${agentLabel(sessionA.agent)}, ${formatTime(sessionA.started_at)})`);
  console.log(`  B: ${chalk.cyan(sessionB.id)} (${agentLabel(sessionB.agent)}, ${formatTime(sessionB.started_at)})`);
  console.log('');

  let onlyA = 0, onlyB = 0, both = 0;

  for (const fp of allPaths) {
    const rel = shortPath(fp, cwd);
    const inA = mapA.has(fp);
    const inB = mapB.has(fp);

    if (inA && inB) {
      console.log(`  ${chalk.yellow('A+B')}  ${rel}`);
      both++;
    } else if (inA) {
      console.log(`  ${chalk.cyan(' A ')}  ${rel}`);
      onlyA++;
    } else {
      console.log(`  ${chalk.magenta(' B ')}  ${rel}`);
      onlyB++;
    }
  }

  console.log('');
  console.log(chalk.dim(`  Only in A: ${onlyA}  |  Only in B: ${onlyB}  |  Both: ${both}`));
  console.log('');
}
