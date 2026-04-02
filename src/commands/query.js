import chalk from 'chalk';
import ora from 'ora';
import { openDb, getAllSessionData } from '../db.js';
import { agentLabel, formatTime, shortPath } from '../utils.js';

const API_URL = 'https://the3rdacademy.com/api/chat/completions';

const SYSTEM_PROMPT = `You are AgentLog's built-in AI assistant. You analyze coding agent session data to answer developer questions.

You have access to session metadata including:
- Session IDs, agents used, timestamps, durations, tags, and notes
- File paths that were added, changed, or deleted (NOT file contents)
- Shell commands that were executed
- File sizes and whether files are binary

You do NOT have access to actual file contents or diffs. Answer based on metadata patterns.

When referencing agentlog commands, format them as code: \`agentlog diff <id>\`, \`agentlog rollback <id>\`, etc.

Be concise and helpful. Focus on patterns, timelines, and actionable insights.`;

function buildContext(sessions) {
  if (sessions.length === 0) return 'No sessions recorded yet.';

  const parts = [];
  for (const s of sessions) {
    const tags = s.tags ? ` [${s.tags}]` : '';
    const notes = s.notes ? ` — ${s.notes}` : '';
    const header = `Session ${s.id} | ${agentLabel(s.agent)} | ${formatTime(s.started_at)} | ${s.ended_at ? 'completed' : 'active'}${tags}${notes}`;
    parts.push(header);

    if (s.files && s.files.length > 0) {
      parts.push('  Files:');
      for (const f of s.files.slice(0, 50)) {
        const binary = f.is_binary ? ' [binary]' : '';
        parts.push(`    ${f.event_type}: ${shortPath(f.file_path, s.cwd)}${binary}`);
      }
      if (s.files.length > 50) {
        parts.push(`    ... and ${s.files.length - 50} more files`);
      }
    }

    if (s.commands && s.commands.length > 0) {
      parts.push('  Commands:');
      for (const c of s.commands.slice(0, 20)) {
        parts.push(`    $ ${c.command}`);
      }
    }

    parts.push('');
  }
  return parts.join('\n');
}

export async function queryCommand(question, options) {
  const cwd = process.cwd();
  const db = await openDb(cwd);
  const sessions = getAllSessionData(db, 20);
  db.close();

  const context = buildContext(sessions);
  const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + '\n\nSession data:\n' + context },
          { role: 'user', content: question.slice(0, 2000) },
        ],
        model: 'a0-default',
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API request failed (HTTP ${response.status})`);
    }

    const data = await response.json();
    spinner.stop();

    const text = data.choices?.[0]?.message?.content || 'No response from AI.';

    console.log('');
    const highlighted = text.replace(
      /`(agentlog\s[^`]+)`/g,
      (_, cmd) => chalk.cyan(cmd)
    );
    for (const line of highlighted.split('\n')) {
      console.log('  ' + line);
    }
    console.log('');
  } catch (err) {
    spinner.fail('Query failed');
    console.log('');
    console.log(chalk.red(`  ${err.message}`));
    console.log('');
    process.exit(1);
  }
}
