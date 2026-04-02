import chalk from 'chalk';
import Anthropic from '@anthropic-ai/sdk';
import ora from 'ora';
import { openDb, getAllSessionData } from '../db.js';
import { agentLabel, formatTime, shortPath } from '../utils.js';

const SYSTEM_PROMPT = `You are AgentLog's built-in AI assistant. You analyze coding agent session data to answer developer questions.

You have access to session metadata including:
- Session IDs, agents used, timestamps, and durations
- File paths that were added, changed, or deleted (NOT file contents)
- Shell commands that were executed

You do NOT have access to actual file contents or diffs. Answer based on metadata patterns.

When referencing agentlog commands, format them as code: \`agentlog diff <id>\`, \`agentlog rollback <id>\`, etc.

Be concise and helpful. Focus on patterns, timelines, and actionable insights.`;

function buildContext(sessions) {
  if (sessions.length === 0) return 'No sessions recorded yet.';

  const parts = [];
  for (const s of sessions) {
    const header = `Session ${s.id} | ${agentLabel(s.agent)} | ${formatTime(s.started_at)} | ${s.ended_at ? 'completed' : 'active'}`;
    parts.push(header);

    if (s.files && s.files.length > 0) {
      parts.push('  Files:');
      for (const f of s.files) {
        parts.push(`    ${f.event_type}: ${shortPath(f.file_path, s.cwd)}`);
      }
    }

    if (s.commands && s.commands.length > 0) {
      parts.push('  Commands:');
      for (const c of s.commands) {
        parts.push(`    $ ${c.command}`);
      }
    }

    parts.push('');
  }
  return parts.join('\n');
}

export async function queryCommand(question, options) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('');
    console.log(chalk.red('✖  ANTHROPIC_API_KEY environment variable not set.'));
    console.log('');
    console.log(chalk.dim('  Set it in your shell profile:'));
    console.log(`  ${chalk.cyan('export ANTHROPIC_API_KEY="sk-ant-..."')}`);
    console.log('');
    console.log(chalk.dim('  Get an API key: https://console.anthropic.com/settings/keys'));
    console.log('');
    process.exit(1);
  }

  const cwd = process.cwd();
  const db = openDb(cwd);
  const sessions = getAllSessionData(db, 20);
  db.close();

  const context = buildContext(sessions);
  const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT + '\n\nSession data:\n' + context,
      messages: [{ role: 'user', content: question }],
    });

    spinner.stop();

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    console.log('');
    // Highlight agentlog commands in cyan
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
