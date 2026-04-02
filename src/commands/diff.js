import chalk from 'chalk';
import { createTwoFilesPatch } from 'diff';
import { openDb, resolveSession, getFileEvents, getShellEvents } from '../db.js';
import { shortPath, formatTime, agentLabel, formatDuration, formatSize, pad } from '../utils.js';

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
  const db = await openDb(cwd);

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

  // Group by file path — last event per file wins
  const fileMap = new Map();
  for (const evt of fileEvents) fileMap.set(evt.file_path, evt);

  let added = 0, modified = 0, deleted = 0, binaryCount = 0;

  // Header card
  console.log('');
  console.log(chalk.bold.cyan('  DIFF'));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
  console.log('');
  console.log(`  ${chalk.bold(session.id)}  ${chalk.dim('·')}  ${agentLabel(session.agent)}  ${chalk.dim('·')}  ${formatTime(session.started_at)}`);

  const duration = session.ended_at != null
    ? formatDuration(session.ended_at - session.started_at)
    : chalk.yellow('ongoing');

  const metaParts = [`${duration}`, `${fileEvents.length} events`, `${shellEvents.length} cmds`];
  console.log(chalk.dim(`  ${metaParts.join('  ·  ')}`));

  if (session.tags) {
    console.log(`  ${session.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ')}`);
  }
  if (session.notes) {
    console.log(chalk.dim(`  "${session.notes}"`));
  }
  console.log('');

  // File changes
  if (fileMap.size > 0) {
    console.log(chalk.bold('  Changed Files'));
    console.log('');

    for (const [filePath, evt] of fileMap) {
      const rel = shortPath(filePath, session.cwd);

      if (evt.is_binary) {
        const icon = evt.event_type === 'add' ? chalk.green('+') : evt.event_type === 'delete' ? chalk.red('-') : chalk.yellow('~');
        console.log(`  ${icon}  ${rel}  ${chalk.dim(`[binary · ${formatSize(evt.file_size)}]`)}`);
        binaryCount++;
        if (evt.event_type === 'add') added++;
        else if (evt.event_type === 'delete') deleted++;
        else modified++;
        continue;
      }

      const before = evt.snapshot_before || '';
      const after = evt.snapshot_after || '';

      let icon, stats;
      if (evt.event_type === 'add') {
        icon = chalk.green('+');
        stats = chalk.green(`+${after.split('\n').length} lines`);
        added++;
      } else if (evt.event_type === 'delete') {
        icon = chalk.red('-');
        stats = chalk.red(`-${before.split('\n').length} lines`);
        deleted++;
      } else {
        icon = chalk.yellow('~');
        const patch = createTwoFilesPatch('a', 'b', before, after);
        let plus = 0, minus = 0;
        for (const l of patch.split('\n')) {
          if (l.startsWith('+') && !l.startsWith('+++')) plus++;
          if (l.startsWith('-') && !l.startsWith('---')) minus++;
        }
        stats = `${chalk.green('+' + plus)} ${chalk.red('-' + minus)}`;
        modified++;
      }

      console.log(`  ${icon}  ${rel}  ${chalk.dim('·')}  ${stats}`);

      if (options.patch && !evt.is_binary) {
        const diffOutput = renderDiff(evt.snapshot_before, evt.snapshot_after, rel);
        if (diffOutput.trim()) {
          console.log(chalk.dim('  ┌' + '─'.repeat(60)));
          for (const line of diffOutput.split('\n')) {
            console.log(chalk.dim('  │ ') + line);
          }
          console.log(chalk.dim('  └' + '─'.repeat(60)));
          console.log('');
        }
      }
    }
    console.log('');
  }

  // Summary bar
  const summaryParts = [];
  if (added > 0) summaryParts.push(chalk.green(`${added} added`));
  if (modified > 0) summaryParts.push(chalk.yellow(`${modified} modified`));
  if (deleted > 0) summaryParts.push(chalk.red(`${deleted} deleted`));
  if (binaryCount > 0) summaryParts.push(chalk.dim(`${binaryCount} binary`));
  if (summaryParts.length > 0) {
    console.log(chalk.dim('  ─────'));
    console.log(`  ${summaryParts.join(chalk.dim('  ·  '))}`);
  }

  // Shell commands
  if (shellEvents.length > 0) {
    console.log('');
    console.log(chalk.bold('  Shell Commands'));
    console.log('');
    for (const cmd of shellEvents) {
      console.log(`  ${chalk.dim(formatTime(cmd.occurred_at))}  ${chalk.cyan('$')} ${cmd.command}`);
    }
  }

  console.log('');
  console.log(chalk.dim(`  ${chalk.cyan(`agentlog rollback ${session.id}`)}  ·  ${chalk.cyan(`agentlog export ${session.id} -f md`)}`));
  console.log('');
}

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

  const mapA = new Map();
  for (const e of filesA) mapA.set(e.file_path, e);
  const mapB = new Map();
  for (const e of filesB) mapB.set(e.file_path, e);

  const allPaths = new Set([...mapA.keys(), ...mapB.keys()]);

  console.log('');
  console.log(chalk.bold.cyan('  SESSION COMPARISON'));
  console.log(chalk.dim('  ' + '─'.repeat(50)));
  console.log('');
  console.log(`  ${chalk.cyan('A')}  ${chalk.bold(sessionA.id)}  ${chalk.dim(agentLabel(sessionA.agent))}  ${chalk.dim(formatTime(sessionA.started_at))}`);
  console.log(`  ${chalk.magenta('B')}  ${chalk.bold(sessionB.id)}  ${chalk.dim(agentLabel(sessionB.agent))}  ${chalk.dim(formatTime(sessionB.started_at))}`);
  console.log('');

  let onlyA = 0, onlyB = 0, both = 0;

  for (const fp of allPaths) {
    const rel = shortPath(fp, cwd);
    const inA = mapA.has(fp);
    const inB = mapB.has(fp);

    if (inA && inB) {
      console.log(`  ${chalk.yellow('A∩B')}  ${rel}`);
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
  console.log(chalk.dim('  ─────'));
  console.log(`  Only ${chalk.cyan('A')}: ${onlyA}  ·  Only ${chalk.magenta('B')}: ${onlyB}  ·  Both: ${both}`);
  console.log('');
}
