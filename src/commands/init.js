import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { openDb } from '../db.js';

const DEFAULT_CONFIG = {
  version: '1.0.0',
  ignore: [
    'node_modules',
    '.git',
    'dist',
    '.next',
    'build',
    '__pycache__',
  ],
  maxSessionHistory: 100,
};

const GITIGNORE_CONTENT = `# AgentLog database files
*.db
*.db-shm
*.db-wal
`;

export async function initCommand() {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (fs.existsSync(agentlogDir)) {
    console.log(chalk.yellow('⚠  .agentlog/ already exists in this directory.'));
    console.log(chalk.dim('  Run `agentlog sessions` to see recorded sessions.'));
    process.exit(1);
  }

  // Create directory
  fs.mkdirSync(agentlogDir, { recursive: true });

  // Write .gitignore
  fs.writeFileSync(path.join(agentlogDir, '.gitignore'), GITIGNORE_CONTENT, 'utf8');

  // Write default config
  fs.writeFileSync(
    path.join(agentlogDir, 'config.json'),
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    'utf8'
  );

  // Initialize the database (creates schema)
  const db = openDb(cwd);
  db.close();

  console.log('');
  console.log(chalk.green('✔  AgentLog initialized in .agentlog/'));
  console.log('');
  console.log(chalk.dim('  Next steps:'));
  console.log(`  ${chalk.cyan('agentlog run cursor')}      — start recording a Cursor session`);
  console.log(`  ${chalk.cyan('agentlog run claude-code')} — wrap a Claude Code session`);
  console.log(`  ${chalk.cyan('agentlog sessions')}        — list recorded sessions`);
  console.log('');
}
