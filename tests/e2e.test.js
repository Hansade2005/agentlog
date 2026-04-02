import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';

const CLI = path.resolve('bin/agentlog.js');
const NODE = process.execPath;

function run(args, opts = {}) {
  return execFileSync(NODE, [CLI, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    cwd: opts.cwd || process.cwd(),
    env: { ...process.env, ...opts.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function runFail(args, opts = {}) {
  try {
    execFileSync(NODE, [CLI, ...args], {
      encoding: 'utf8',
      timeout: 15000,
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

/**
 * Helper: init a test dir, run a session that creates/modifies files, return session ID.
 */
async function createTestSession(testDir, extraOpts = []) {
  run(['init'], { cwd: testDir });
  fs.writeFileSync(path.join(testDir, 'hello.txt'), 'hello world\n', 'utf8');
  fs.writeFileSync(path.join(testDir, 'code.js'), 'const x = 1;\n', 'utf8');

  const child = spawn(NODE, [CLI, 'run', 'custom', ...extraOpts], {
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
  await new Promise((r) => setTimeout(r, 500));

  fs.writeFileSync(path.join(testDir, 'hello.txt'), 'hello modified\n', 'utf8');
  await new Promise((r) => setTimeout(r, 200));
  fs.writeFileSync(path.join(testDir, 'new-file.txt'), 'agent created\n', 'utf8');
  await new Promise((r) => setTimeout(r, 2000));

  child.kill('SIGINT');
  await new Promise((resolve) => child.on('close', resolve));

  const sessionsOut = run(['sessions'], { cwd: testDir });
  const idMatch = sessionsOut.match(/([a-f0-9]{12})/);
  assert.ok(idMatch, 'Should find 12-char session ID');
  return idMatch[1];
}

describe('agentlog CLI', () => {
  let testDir;

  beforeEach(() => {
    testDir = makeTmpDir();
  });

  describe('version', () => {
    it('should print version', () => {
      const out = run(['--version']);
      assert.match(out.trim(), /^\d+\.\d+\.\d+$/);
    });
  });

  describe('init', () => {
    it('should create .agentlog directory with all files', () => {
      const out = run(['init'], { cwd: testDir });
      assert.ok(out.includes('AgentLog initialized'));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', 'sessions.db')));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', 'config.json')));
      assert.ok(fs.existsSync(path.join(testDir, '.agentlog', '.gitignore')));
    });

    it('should reject double init', () => {
      run(['init'], { cwd: testDir });
      const { stdout } = runFail(['init'], { cwd: testDir });
      assert.ok(stdout.includes('already exists'));
    });

    it('should create valid config with v1.1 schema', () => {
      run(['init'], { cwd: testDir });
      const config = JSON.parse(
        fs.readFileSync(path.join(testDir, '.agentlog', 'config.json'), 'utf8')
      );
      assert.equal(config.version, '1.1.0');
      assert.ok(Array.isArray(config.ignore));
      assert.ok(config.maxSessionHistory > 0);
      assert.ok(config.maxFileSize > 0);
      assert.ok(Array.isArray(config.excludeExtensions));
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
    it('should record, diff, and rollback file changes', async () => {
      const sessionId = await createTestSession(testDir);

      // Diff
      const diffOut = run(['diff', sessionId], { cwd: testDir });
      assert.ok(diffOut.includes('hello.txt'));
      assert.ok(diffOut.includes('new-file.txt'));

      // Diff --patch
      const patchOut = run(['diff', sessionId, '--patch'], { cwd: testDir });
      assert.ok(patchOut.includes('+hello modified'));
      assert.ok(patchOut.includes('-hello world'));

      // Prefix match
      const shortDiff = run(['diff', sessionId.slice(0, 4)], { cwd: testDir });
      assert.ok(shortDiff.includes(sessionId));

      // Rollback
      const rollbackOut = run(['rollback', sessionId, '--yes'], { cwd: testDir });
      assert.ok(rollbackOut.includes('restored'));
      assert.ok(rollbackOut.includes('deleted'));
      assert.ok(rollbackOut.includes('succeeded'));

      assert.equal(fs.readFileSync(path.join(testDir, 'hello.txt'), 'utf8'), 'hello world\n');
      assert.ok(!fs.existsSync(path.join(testDir, 'new-file.txt')));
    });
  });

  describe('tagging', () => {
    it('should support tags during run and tag command', async () => {
      const sessionId = await createTestSession(testDir, ['--tag', 'bugfix', 'auth']);

      // Check tags appear in sessions
      const sessionsOut = run(['sessions'], { cwd: testDir });
      assert.ok(sessionsOut.includes('bugfix'));
      assert.ok(sessionsOut.includes('auth'));

      // Add note via tag command
      run(['tag', sessionId, '--note', 'Fixed auth bug'], { cwd: testDir });

      // Verify note shows in sessions
      const out2 = run(['sessions'], { cwd: testDir });
      assert.ok(out2.includes('Fixed auth bug'));

      // Filter by tag
      const filtered = run(['sessions', '--tag', 'bugfix'], { cwd: testDir });
      assert.ok(filtered.includes(sessionId.slice(0, 8)));

      const empty = run(['sessions', '--tag', 'nonexistent'], { cwd: testDir });
      assert.ok(empty.includes('No sessions'));
    });
  });

  describe('export', () => {
    it('should export as JSON', async () => {
      const sessionId = await createTestSession(testDir);
      const out = run(['export', sessionId, '--format', 'json'], { cwd: testDir });
      const data = JSON.parse(out);
      assert.equal(data.session.id, sessionId);
      assert.ok(Array.isArray(data.file_events));
      assert.ok(data.file_events.length > 0);
      assert.ok(data.exported_at);
    });

    it('should export as markdown', async () => {
      const sessionId = await createTestSession(testDir);
      const out = run(['export', sessionId, '--format', 'md'], { cwd: testDir });
      assert.ok(out.includes(`# Session ${sessionId}`));
      assert.ok(out.includes('File Changes'));
    });

    it('should export as patch', async () => {
      const sessionId = await createTestSession(testDir);
      const out = run(['export', sessionId, '--format', 'patch'], { cwd: testDir });
      assert.ok(out.includes('---'));
      assert.ok(out.includes('+++'));
    });

    it('should export to file', async () => {
      const sessionId = await createTestSession(testDir);
      const outFile = path.join(testDir, 'export.json');
      run(['export', sessionId, '--format', 'json', '--output', outFile], { cwd: testDir });
      assert.ok(fs.existsSync(outFile));
      const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      assert.equal(data.session.id, sessionId);
    });
  });

  describe('stats', () => {
    it('should show analytics', async () => {
      await createTestSession(testDir);
      const out = run(['stats'], { cwd: testDir });
      assert.ok(out.includes('Analytics'));
      assert.ok(out.includes('Sessions'));
      assert.ok(out.includes('File events'));
      assert.ok(out.includes('Custom'));
    });

    it('should handle empty state', () => {
      run(['init'], { cwd: testDir });
      const out = run(['stats'], { cwd: testDir });
      assert.ok(out.includes('No sessions'));
    });
  });

  describe('error handling', () => {
    it('should error on run without init', () => {
      const tmp = makeTmpDir();
      const { stdout } = runFail(['run', 'custom'], { cwd: tmp });
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
  });

  describe('ignore patterns', () => {
    it('should not record .agentlog or node_modules changes', async () => {
      run(['init'], { cwd: testDir });

      const child = spawn(NODE, [CLI, 'run', 'custom'], {
        cwd: testDir, stdio: 'pipe', env: process.env,
      });

      await new Promise((resolve) => {
        let output = '';
        child.stdout.on('data', (d) => {
          output += d.toString();
          if (output.includes('Ctrl+C') || output.includes('Indexed')) resolve();
        });
        setTimeout(resolve, 5000);
      });
      await new Promise((r) => setTimeout(r, 500));

      fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
      fs.writeFileSync(path.join(testDir, 'node_modules', 'pkg.js'), 'test', 'utf8');
      await new Promise((r) => setTimeout(r, 200));
      fs.writeFileSync(path.join(testDir, 'tracked.txt'), 'tracked\n', 'utf8');
      await new Promise((r) => setTimeout(r, 2000));

      child.kill('SIGINT');
      await new Promise((resolve) => child.on('close', resolve));

      const sessionsOut = run(['sessions'], { cwd: testDir });
      const idMatch = sessionsOut.match(/([a-f0-9]{12})/);
      const sessionId = idMatch[1];

      const diffOut = run(['diff', sessionId], { cwd: testDir });
      assert.ok(diffOut.includes('tracked.txt'));
      assert.ok(!diffOut.includes('node_modules'));
      assert.ok(!diffOut.includes('sessions.db'));
    });
  });

  describe('binary file handling', () => {
    it('should detect and label binary files', async () => {
      run(['init'], { cwd: testDir });

      const child = spawn(NODE, [CLI, 'run', 'custom'], {
        cwd: testDir, stdio: 'pipe', env: process.env,
      });

      await new Promise((resolve) => {
        let output = '';
        child.stdout.on('data', (d) => {
          output += d.toString();
          if (output.includes('Ctrl+C') || output.includes('Indexed')) resolve();
        });
        setTimeout(resolve, 5000);
      });
      await new Promise((r) => setTimeout(r, 500));

      // Create a binary file (contains null bytes)
      fs.writeFileSync(path.join(testDir, 'photo.png'), Buffer.from([137, 80, 78, 71, 0, 0, 0, 13]));
      fs.writeFileSync(path.join(testDir, 'text.txt'), 'just text\n', 'utf8');
      await new Promise((r) => setTimeout(r, 2000));

      child.kill('SIGINT');
      await new Promise((resolve) => child.on('close', resolve));

      const sessionsOut = run(['sessions'], { cwd: testDir });
      const idMatch = sessionsOut.match(/([a-f0-9]{12})/);
      const diffOut = run(['diff', idMatch[1]], { cwd: testDir });
      assert.ok(diffOut.includes('binary'));
      assert.ok(diffOut.includes('text.txt'));
    });
  });
});
