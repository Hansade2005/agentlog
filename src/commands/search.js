import chalk from 'chalk';
import { openDb, getSessions, getFileEvents } from '../db.js';
import { agentLabel, formatRelative, formatDuration, shortPath, pad } from '../utils.js';

export async function searchCommand(pattern, options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);

  const allSessions = getSessions(db, { limit: 200 });

  if (allSessions.length === 0) {
    db.close();
    console.log('');
    console.log(chalk.dim('  No sessions recorded yet.'));
    console.log('');
    return;
  }

  // Build search filters
  const filePattern = pattern ? new RegExp(pattern.replace(/\*/g, '.*'), 'i') : null;
  const minFiles = options.minFiles ? parseInt(options.minFiles, 10) : 0;
  const agent = options.agent || null;

  const results = [];

  for (const s of allSessions) {
    if (agent && s.agent !== agent) continue;

    const events = getFileEvents(db, s.id);
    const fileMap = new Map();
    for (const e of events) fileMap.set(e.file_path, e);

    if (fileMap.size < minFiles) continue;

    if (filePattern) {
      const matchingFiles = [...fileMap.keys()].filter((fp) => {
        const rel = shortPath(fp, s.cwd);
        return filePattern.test(rel) || filePattern.test(fp);
      });
      if (matchingFiles.length === 0) continue;
      results.push({ session: s, events, fileMap, matchingFiles });
    } else {
      results.push({ session: s, events, fileMap, matchingFiles: [...fileMap.keys()] });
    }
  }

  db.close();

  if (results.length === 0) {
    console.log('');
    console.log(chalk.dim(`  No sessions match "${pattern || '*'}".`));
    console.log('');
    return;
  }

  console.log('');
  console.log(chalk.bold.cyan(`  SEARCH RESULTS`));
  console.log(chalk.dim(`  Pattern: ${pattern || '*'}  ·  ${results.length} session(s) found`));
  console.log('');

  for (const { session: s, matchingFiles } of results) {
    const isActive = s.ended_at == null;
    const duration = isActive ? chalk.yellow('live') : formatDuration(s.ended_at - s.started_at);
    const dot = isActive ? chalk.yellow('◉') : chalk.green('●');
    const tags = s.tags ? '  ' + s.tags.split(',').map((t) => chalk.magenta(`#${t}`)).join(' ') : '';

    console.log(`  ${dot} ${chalk.bold(s.id)}  ${agentLabel(s.agent)}  ${chalk.dim(formatRelative(s.started_at))}  ${duration}${tags}`);

    // Show matching files
    const show = matchingFiles.slice(0, 5);
    for (const fp of show) {
      const rel = shortPath(fp, s.cwd);
      console.log(chalk.dim(`    → ${rel}`));
    }
    if (matchingFiles.length > 5) {
      console.log(chalk.dim(`    ... and ${matchingFiles.length - 5} more matches`));
    }
    console.log('');
  }
}
