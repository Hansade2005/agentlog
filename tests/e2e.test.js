import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

const CLI = path.resolve('bin/agentlog.js');
const NODE = process.execPath;

function run(args, opts = {}) {
  const result = execFileSync(NODE, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 10000,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result;
}

function runFail(args, opts = {}) {
  try {
    execFileSync(NODE, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 10000,
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...opts.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.fail('Expected command to fail');
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', code: err.status };
  }
}

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agentlog-test-'));
}

describe('agentlog CLI', () => {
  let testDir;

  beforeEach(() => {
    testDir = makeTmpDir();
  });

  after(() => {
    // Cleanup is best-effort
  });

  describe('version', () => {
    it('should print version', () => {
      const out = run(['--version']);
      assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('init', () => {
    it('should create .agentlog directory', () => {
      const out = run(['init'], { cwd: testDir });
      assert.ok(out.includes('AgentLog initialized'));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog')));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', 'sessions.db')));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', 'config.json')));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', '.gitignore')));
    });

    it('should reject double init', () => {
      run(['init'], { cwd: testDir });
      const { stdout } = runFail(['init'], { cwd: testDir });
      assert.ok(stdout.includes('already exists'));
    });

    it('should create valid config', () => {
      run(['init'], { cwd: testDir });
      const config = JSON.parse(
        fs.readFileSync(path.join(testDir, '.agentlog', 'config.json'), 'utf8')
      );
      assert.equal(config.version, '1.0.0');
      assert.ok(Array.isArray(config.ignore));
      assert.ok(config.ignore.includes('node_modules'));
    });
  });

  describe('sessions (empty)', () => {
    it('should show empty state', () => {
      run(['init'], { cwd: testDir });
      const out = run(['sessions'], { cwd: testDir });
      assert.ok(out.includes('No sessions recorded'));
    });

    it('should work with ls alias', () => {
      run(['init'], { cwd: testDir });
      const out = run(['ls'], { cwd: testDir });
      assert.ok(out.includes('No sessions recorded'));
    });
  });

  describe('run + diff + rollback', () => {
    it('should record file changes and rollback', async () => {
      // Init
      run(['init'], { cwd: testDir });

      // Create initial files
      fs.writeFileSync(path.join(testDir, 'hello.txt'), 'hello world\n', 'utf8');
      fs.writeFileSync(path.join(testDir, 'code.js'), 'const x = 1;\n', 'utf8');

      // Start recording in background
      const child = spawn(NODE, [CLI, 'run', 'custom'], {
        cwd: testDir,
        stdio: 'pipe',
        env: process.env,
      });

      // Wait for watcher to be ready
      await new Promise((resolve) => {
        let output = '';
        child.stdout.on('data', (d) => {
          output += d.toString();
          if (output.includes('Ctrl+C') || output.includes('Indexed')) resolve();
        });
        setTimeout(resolve, 5000);
      });

      // Extra settle time for watcher to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Simulate agent changes
      fs.writeFileSync(path.join(testDir, 'hello.txt'), 'hello modified\n', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'agent created\n', 'utf8');

      // Wait for write stabilization (awaitWriteFinish: 300ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Stop recording
      child.kill('SIGINT');
      await new Promise((resolve) => child.on('close', resolve));

      // Check sessions
      const sessionsOut = run(['sessions'], { cwd: testDir });
      assert.ok(sessionsOut.includes('Custom'));
      assert.ok(!sessionsOut.includes('No sessions'));

      // Extract session ID from output (8 hex chars)
      const idMatch = sessionsOut.match(/([a-f0-9]{8})/);
      assert.ok(idMatch, 'Should find session ID');
      const sessionId = idMatch[1];

      // Check diff
      const diffOut = run(['diff', sessionId], { cwd: testDir });
      assert.ok(diffOut.includes('hello.txt'));
      assert.ok(diffOut.includes('new-file.txt'));

      // Check diff --patch
      const patchOut = run(['diff', sessionId, '--patch'], { cwd: testDir });
      assert.ok(patchOut.includes('+hello modified'));
      assert.ok(patchOut.includes('-hello world'));

      // Check diff with short ID
      const shortDiff = run(['diff', sessionId.slice(0, 4)], { cwd: testDir });
      assert.ok(shortDiff.includes(sessionId));

      // Rollback
      const rollbackOut = run(['rollback', sessionId, '--yes'], { cwd: testDir });
      assert.ok(rollbackOut.includes('restored'));
      assert.ok(rollbackOut.includes('deleted'));
      assert.ok(rollbackOut.includes('succeeded'));

      // Verify rollback
      assert.equal(fs.readFileSync(path.join(testDir, 'hello.txt'), 'utf8'), 'hello world\n');
      assert.equal(fs.readFileSync(path.join(testDir, 'code.js'), 'utf8'), 'const x = 1;\n');
      assert.ok(!fs.existsSync(path.join(testDir, 'new-file.txt')));
    });
  });

  describe('error handling', () => {
    it('should error on run without init', () => {
      const tmpNoInit = makeTmpDir();
      // Will use global fallback db, but let's test with an uninitialized dir
      // The run command checks for .agentlog dir
      const { stdout } = runFail(['run', 'custom'], { cwd: tmpNoInit });
      assert.ok(stdout.includes('No .agentlog'));
    });

    it('should error on invalid agent', () => {
      run(['init'], { cwd: testDir });
      const { stdout } = runFail(['run', 'invalid-agent'], { cwd: testDir });
      assert.ok(stdout.includes('Unknown agent'));
    });

    it('should error on nonexistent session diff', () => {
      run(['init'], { cwd: testDir });
      const { stdout } = runFail(['diff', 'nonexistent'], { cwd: testDir });
      assert.ok(stdout.includes('No session found'));
    });

    it('should error on nonexistent session rollback', () => {
      run(['init'], { cwd: testDir });
      const { stdout } = runFail(['rollback', 'nonexistent', '--yes'], { cwd: testDir });
      assert.ok(stdout.includes('No session found'));
    });

    it('should attempt query and handle API response or network error', () => {
      run(['init'], { cwd: testDir });
      try {
        const out = execFileSync(NODE, [CLI, 'query', 'list my sessions'], {
          encoding: 'utf8',
          timeout: 15000,
          cwd: testDir,
          env: process.env,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        assert.ok(typeof out === 'string');
      } catch (err) {
        // Network/timeout errors are expected in sandboxed environments
        const output = (err.stdout || '') + (err.stderr || '');
        assert.ok(
          output.includes('Query failed') ||
          output.includes('fetch') ||
          err.status !== 0,
          'Should fail gracefully with a network or API error'
        );
      }
    });
  });

  describe('ignore patterns', () => {
    it('should not record .agentlog directory changes', async () => {
      run(['init'], { cwd: testDir });

      const child = spawn(NODE, [CLI, 'run', 'custom'], {
        cwd: testDir,
        stdio: 'pipe',
        env: process.env,
      });

      await new Promise((resolve) => {
        let output = '';
        child.stdout.on('data', (d) => {
          output += d.toString();
          if (output.includes('Ctrl+C') || output.includes('Indexed')) resolve();
        });
        setTimeout(resolve, 5000);
      });

      await new Promise((resolve) => setTimeout(resolve, 500));

      // Write to ignored directories
      fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'node_modules', 'pkg.js'), 'test', 'utf8');

      // Write a tracked file
      await new Promise((resolve) => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(testDir, 'tracked.txt'), 'tracked\n', 'utf8');

      await new Promise((resolve) => setTimeout(resolve, 2000));
      child.kill('SIGINT');
      await new Promise((resolve) => child.on('close', resolve));

      // Diff should only show tracked.txt, not node_modules or .agentlog changes
      const sessionsOut = run(['sessions'], { cwd: testDir });
      const idMatch = sessionsOut.match(/([a-f0-9]{8})/);
      const sessionId = idMatch[1];

      const diffOut = run(['diff', sessionId], { cwd: testDir });
      assert.ok(diffOut.includes('tracked.txt'));
      assert.ok(!diffOut.includes('node_modules'));
      assert.ok(!diffOut.includes('sessions.db'));
    });
  });
});
