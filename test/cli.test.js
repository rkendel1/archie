const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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
