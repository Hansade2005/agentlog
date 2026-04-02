import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { openDb } from '../db.js';

const DEFAULT_CONFIG = {
  version: '1.1.0',
  ignore: [
    'node_modules',
    '.git',
    'dist',
    '.next',
    'build',
    '__pycache__',
    '.venv',
    'venv',
    '.tox',
    'coverage',
    '.nyc_output',
  ],
  maxSessionHistory: 100,
  maxFileSize: 5242880,
  excludeExtensions: ['.pyc', '.pyo', '.class', '.o', '.obj', '.exe', '.dll', '.so', '.dylib'],
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
    console.log(chalk.yellow('  .agentlog/ already exists in this directory.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog sessions')} to see recorded sessions.`));
    process.exit(1);
  }

  fs.mkdirSync(agentlogDir, { recursive: true });
  fs.writeFileSync(path.join(agentlogDir, '.gitignore'), GITIGNORE_CONTENT, 'utf8');
  fs.writeFileSync(
    path.join(agentlogDir, 'config.json'),
    JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n',
    'utf8'
  );

  const db = openDb(cwd);
  db.close();

  console.log('');
  console.log(chalk.green('  AgentLog initialized in .agentlog/'));
  console.log('');
  console.log(chalk.dim('  Next steps:'));
  console.log(`  ${chalk.cyan('agentlog run cursor')}          Record a Cursor session`);
  console.log(`  ${chalk.cyan('agentlog run claude-code')}     Wrap a Claude Code session`);
  console.log(`  ${chalk.cyan('agentlog run custom')}          Watch filesystem for any tool`);
  console.log(`  ${chalk.cyan('agentlog sessions')}            List recorded sessions`);
  console.log('');
}
