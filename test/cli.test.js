const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync, spawn } = require('node:child_process');

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'archie-cli-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture',
    main: 'src/index.js'
  }, null, 2));
  fs.writeFileSync(path.join(repo, 'src', 'index.js'), 'console.log("hello")\n');
  fs.writeFileSync(path.join(repo, 'src', 'runtime-manifest.ts'), 'export type Manifest = { v: number }\n');
  return repo;
}

test('participant analyze/check/report commands run for repo', () => {
  const repo = makeRepo();
  const bin = path.join('/home/runner/work/archie/archie', 'bin', 'participant');

  const analyze = execFileSync('node', [bin, 'analyze', '--repo', repo], { encoding: 'utf8' });
  assert.ok(analyze.includes('"ok": true'));

  const contracts = execFileSync('node', [bin, 'check', 'contracts', '--repo', repo], { encoding: 'utf8' });
  assert.ok(contracts.includes('"ok": true'));

  const report = execFileSync('node', [bin, 'report', '--repo', repo, '--format', 'github'], { encoding: 'utf8' });
  assert.ok(report.includes('ENGINEERING ASSURANCE'));
});

test('participant session and live status commands work with runtime server', async () => {
  const repo = makeRepo();
  const bin = path.join('/home/runner/work/archie/archie', 'bin', 'participant');
  const port = String(44000 + Math.floor(Math.random() * 1000));

  const runtime = spawn('node', [bin, 'serve', '--repo', repo, '--port', port], {
    stdio: 'ignore'
  });

  await new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve();
        }
      });
      req.on('error', () => {
        if (attempts >= 40) {
          clearInterval(timer);
          reject(new Error('Runtime health endpoint did not become available'));
        }
      });
    }, 50);
  });

  const start = execFileSync('node', [bin, 'session', 'start', '--port', port, '--intent', 'Implement runtime API'], { encoding: 'utf8' });
  assert.ok(start.includes('"status": "active"'));
  const startedSession = JSON.parse(start);

  const status = execFileSync('node', [bin, 'status', '--live', '--port', port], { encoding: 'utf8' });
  assert.ok(status.includes('ARCHIE LIVE STATUS'));

  const propose = execFileSync('node', [
    bin,
    'change',
    'propose',
    '--port',
    port,
    '--intent',
    'Add anomaly detection to analytics',
    '--files',
    'src/runtime-manifest.ts,src/analytics-worker.rs'
  ], { encoding: 'utf8' });
  assert.ok(propose.includes('"proposal"'));

  const review = execFileSync('node', [bin, 'change', 'review', '--port', port], { encoding: 'utf8' });
  assert.ok(review.includes('CHANGE REVIEW'));

  const guidance = execFileSync('node', [bin, 'change', 'guidance', '--port', port], { encoding: 'utf8' });
  assert.ok(guidance.includes('Open risks:'));

  const assembledContext = execFileSync('node', [
    bin,
    'context',
    '--port',
    port,
    '--change',
    startedSession.id,
    '--format',
    'summary'
  ], { encoding: 'utf8' });
  assert.ok(assembledContext.includes('"requiredEvidence"'));

  const complete = execFileSync('node', [bin, 'session', 'complete', '--port', port], { encoding: 'utf8' });
  assert.ok(complete.includes('"status": "completed"'));

  const discover = execFileSync('node', [bin, 'agent', 'discover', '--port', port], { encoding: 'utf8' });
  assert.ok(discover.includes('ARCHIE AGENT PARTICIPATION'));

  const register = execFileSync('node', [
    bin,
    'agent',
    'register',
    '--port',
    port,
    '--id',
    'coding-agent-01',
    '--name',
    'Local Coding Agent',
    '--capabilities',
    'read,write,plan,verify'
  ], { encoding: 'utf8' });
  assert.ok(register.includes('"agent_id": "coding-agent-01"'));

  const registered = JSON.parse(register);
  const context = execFileSync('node', [
    bin,
    'agent',
    'context',
    '--port',
    port,
    '--session',
    registered.session_id,
    '--intent',
    'Add dataset insight capabilities',
    '--format',
    'summary'
  ], { encoding: 'utf8' });
  assert.ok(context.includes('"required_evidence"'));

  await new Promise((resolve) => {
    const req = http.request(`http://127.0.0.1:${port}/v1/runtime/stop`, { method: 'POST' }, () => resolve());
    req.on('error', () => resolve());
    req.end();
  });
  runtime.kill('SIGTERM');
});

test('participant supports analyzer inspection and language filtering', () => {
  const repo = makeRepo();
  const bin = path.join('/home/runner/work/archie/archie', 'bin', 'participant');
  fs.mkdirSync(path.join(repo, 'services'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'services', 'app.py'), 'if __name__ == "__main__":\n  print("ok")\n');

  const analyzers = execFileSync('node', [bin, 'analyzers', '--repo', repo], { encoding: 'utf8' });
  assert.ok(analyzers.includes('JavaScript / TypeScript'));
  assert.ok(analyzers.includes('Python'));

  const summary = execFileSync('node', [bin, 'analyze', '--repo', repo, '--summary', '--language', 'python'], { encoding: 'utf8' });
  assert.ok(summary.includes('"languages"'));
  assert.ok(summary.includes('Python'));
});

test('participant up/down manage local runtime lifecycle', async () => {
  const repo = makeRepo();
  const bin = path.join('/home/runner/work/archie/archie', 'bin', 'participant');
  const port = String(45000 + Math.floor(Math.random() * 1000));
  const runtime = spawn('node', [bin, 'serve', '--repo', repo, '--port', port], { stdio: 'ignore' });

  await new Promise((resolve, reject) => {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          clearInterval(timer);
          resolve();
        }
      });
      req.on('error', () => {
        if (attempts >= 40) {
          clearInterval(timer);
          reject(new Error('Runtime health endpoint did not become available'));
        }
      });
    }, 50);
  });

  const up = execFileSync('node', [bin, 'up', '--port', port, '--no-desktop', '--timeout-ms', '2000'], {
    encoding: 'utf8',
    env: { ...process.env, ARCHIE_UP_SKIP_COMPOSE: '1' }
  });
  assert.ok(up.includes('Starting Archie local runtime...'));
  assert.ok(up.includes('✓ Archie runtime is ready'));
  assert.ok(up.includes('Archie is ready.'));

  const down = execFileSync('node', [bin, 'down', '--port', port], {
    encoding: 'utf8',
    env: { ...process.env, ARCHIE_UP_SKIP_COMPOSE: '1' }
  });
  assert.ok(down.includes('Archie local runtime stopped.'));

  await new Promise((resolve) => setTimeout(resolve, 50));
  const stopped = await new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, () => resolve(false));
    req.on('error', () => resolve(true));
  });
  assert.equal(stopped, true);
  runtime.kill('SIGTERM');
});
