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

  const status = execFileSync('node', [bin, 'status', '--live', '--port', port], { encoding: 'utf8' });
  assert.ok(status.includes('ARCHIE LIVE STATUS'));

  const complete = execFileSync('node', [bin, 'session', 'complete', '--port', port], { encoding: 'utf8' });
  assert.ok(complete.includes('"status": "completed"'));

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
