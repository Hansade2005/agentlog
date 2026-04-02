import fs from 'node:fs';
import chalk from 'chalk';
import { openDb, resolveSession, getFileEvents, getShellEvents } from '../db.js';
import { shortPath, agentLabel, formatTime, formatDuration } from '../utils.js';
import { createTwoFilesPatch } from 'diff';

export async function exportCommand(sessionId, options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);

  const session = resolveSession(db, sessionId);
  if (session.error) {
    console.log(chalk.red(`  ${session.error}`));
    db.close();
    process.exit(1);
  }

  const fileEvents = getFileEvents(db, session.id);
  const shellEvents = getShellEvents(db, session.id);
  db.close();

  const format = options.format || 'json';
  let output;

  if (format === 'json') {
    output = exportJSON(session, fileEvents, shellEvents);
  } else if (format === 'md' || format === 'markdown') {
    output = exportMarkdown(session, fileEvents, shellEvents, cwd);
  } else if (format === 'patch') {
    output = exportPatch(session, fileEvents, cwd);
  } else {
    console.log(chalk.red(`  Unknown format "${format}". Use: json, md, patch`));
    process.exit(1);
  }

  if (options.output) {
    fs.writeFileSync(options.output, output, 'utf8');
    console.log(chalk.green(`  Exported session ${session.id} to ${options.output}`));
  } else {
    process.stdout.write(output);
  }
}

function exportJSON(session, fileEvents, shellEvents) {
  const data = {
    session: {
      id: session.id,
      agent: session.agent,
      cwd: session.cwd,
      started_at: new Date(session.started_at).toISOString(),
      ended_at: session.ended_at ? new Date(session.ended_at).toISOString() : null,
      exit_code: session.exit_code,
      tags: session.tags ? session.tags.split(',').filter(Boolean) : [],
      notes: session.notes || '',
    },
    file_events: fileEvents.map((e) => ({
      type: e.event_type,
      path: e.file_path,
      is_binary: !!e.is_binary,
      file_size: e.file_size,
      timestamp: new Date(e.occurred_at).toISOString(),
    })),
    shell_events: shellEvents.map((e) => ({
      command: e.command,
      cwd: e.cwd,
      timestamp: new Date(e.occurred_at).toISOString(),
    })),
    exported_at: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2) + '\n';
}

function exportMarkdown(session, fileEvents, shellEvents, cwd) {
  const duration = session.ended_at
    ? formatDuration(session.ended_at - session.started_at)
    : 'ongoing';

  const lines = [
    `# Session ${session.id}`,
    '',
    `| Field | Value |`,
    `|-------|-------|`,
    `| Agent | ${agentLabel(session.agent)} |`,
    `| Started | ${formatTime(session.started_at)} |`,
    `| Duration | ${duration} |`,
    `| Exit Code | ${session.exit_code ?? 'N/A'} |`,
  ];

  if (session.tags) lines.push(`| Tags | ${session.tags} |`);
  if (session.notes) lines.push(`| Notes | ${session.notes} |`);

  lines.push('', `## File Changes (${fileEvents.length} events)`, '');

  // Group by file
  const fileMap = new Map();
  for (const e of fileEvents) fileMap.set(e.file_path, e);

  for (const [filePath, evt] of fileMap) {
    const rel = shortPath(filePath, session.cwd);
    const label = evt.event_type === 'add' ? 'Added' : evt.event_type === 'delete' ? 'Deleted' : 'Modified';
    lines.push(`- **${label}**: \`${rel}\``);
  }

  if (shellEvents.length > 0) {
    lines.push('', `## Shell Commands (${shellEvents.length})`, '');
    for (const cmd of shellEvents) {
      lines.push(`- \`${cmd.command}\` (${formatTime(cmd.occurred_at)})`);
    }
  }

  lines.push('', `---`, `*Exported by AgentLog*`, '');
  return lines.join('\n');
}

function exportPatch(session, fileEvents, cwd) {
  const fileMap = new Map();
  for (const e of fileEvents) fileMap.set(e.file_path, e);

  const patches = [];
  for (const [filePath, evt] of fileMap) {
    if (evt.is_binary) continue;
    const rel = shortPath(filePath, session.cwd);
    const patch = createTwoFilesPatch(
      `a/${rel}`, `b/${rel}`,
      evt.snapshot_before || '', evt.snapshot_after || '',
      'before', 'after'
    );
    patches.push(patch);
  }
  return patches.join('\n');
}
