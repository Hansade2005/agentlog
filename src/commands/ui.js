import chalk from 'chalk';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../server.js';

export async function uiCommand(options) {
  const cwd = process.cwd();
  const agentlogDir = path.join(cwd, '.agentlog');

  if (!fs.existsSync(agentlogDir)) {
    console.log(chalk.red('  No .agentlog/ directory found.'));
    console.log(chalk.dim(`  Run ${chalk.cyan('agentlog init')} first.`));
    process.exit(1);
  }

  const port = parseInt(options.port, 10) || 4242;

  console.log('');
  console.log(chalk.bold.cyan('  AgentLog Dashboard'));
  console.log(chalk.dim('  ' + '─'.repeat(40)));

  const server = await createServer(cwd, port);
  const url = `http://localhost:${port}`;

  console.log('');
  console.log(`  ${chalk.green('●')}  Running at ${chalk.bold.underline(url)}`);
  console.log('');
  console.log(chalk.dim('  Press Ctrl+C to stop the dashboard.'));
  console.log('');

  // Try to open browser
  try {
    const { exec } = await import('node:child_process');
    const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    if (!options.noBrowser) {
      exec(`${cmd} ${url}`);
    }
  } catch {
    // Can't open browser — that's fine
  }

  process.on('SIGINT', () => {
    server.close();
    console.log('');
    console.log(chalk.dim('  Dashboard stopped.'));
    process.exit(0);
  });
}
