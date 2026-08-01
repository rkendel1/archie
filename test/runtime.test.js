const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startRuntimeServer } = require('../src/runtime');

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'archie-runtime-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture',
    main: 'src/index.js'
  }, null, 2));
  fs.writeFileSync(path.join(repo, 'src', 'index.js'), 'require("./runtime-manifest")\n');
  fs.writeFileSync(path.join(repo, 'src', 'runtime-manifest.ts'), 'export type RuntimeManifest = { v: number }\n');
  fs.writeFileSync(path.join(repo, 'src', 'analytics-worker.rs'), 'fn main() {}\n');
  return repo;
}

function request(baseUrl, method, pathname, body) {
  const url = new URL(pathname, baseUrl);
  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        resolve(JSON.parse(data || '{}'));
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

test('runtime server tracks model versions, sessions, and events', async () => {
  const repo = makeRepo();
  const server = await startRuntimeServer(repo, { port: 0 });

  const health = await request(server.baseUrl, 'GET', '/health');
  assert.equal(health.ok, true);
  assert.equal(health.repository_watch, 'active');
  assert.equal(health.model_version, 1);

  const session = await request(server.baseUrl, 'POST', '/v1/sessions', { intent: 'Add dataset insight capabilities' });
  assert.equal(session.intent.status, 'explicit');
  assert.equal(session.status, 'active');

  const summary = await request(server.baseUrl, 'GET', '/v1/model/summary');
  assert.ok(Array.isArray(summary.analyzers));
  assert.ok(Array.isArray(summary.languages));

  fs.writeFileSync(path.join(repo, 'src', 'runtime-manifest.ts'), 'export type RuntimeManifest = { v: number; next?: string }\n');
  const update = await request(server.baseUrl, 'POST', '/v1/analyze', { files: ['src/runtime-manifest.ts'] });
  assert.equal(update.model_version, 2);
  assert.equal(update.analysis.mode, 'incremental');
  assert.ok(update.delta.nodes_updated >= 0);

  const evidence = await request(server.baseUrl, 'GET', '/v1/evidence');
  assert.ok(evidence.evidence.some((entry) => entry.status === 'stale'));

  const events = await request(server.baseUrl, 'GET', '/v1/events');
  const graphUpdated = events.events.find((event) => event.type === 'graph.updated');
  assert.ok(graphUpdated);
  assert.equal(graphUpdated.repository_id, path.basename(repo));
  assert.equal(typeof graphUpdated.sequence, 'number');
  assert.equal(graphUpdated.model_version, 2);

  const invalidated = events.events.find((event) => event.type === 'evidence.invalidated');
  assert.ok(invalidated);
  assert.ok(invalidated.payload.reason.type);

  const verify = await request(server.baseUrl, 'POST', '/v1/verify');
  assert.equal(verify.ok, false);

  const stopped = await request(server.baseUrl, 'POST', '/v1/runtime/stop');
  assert.equal(stopped.ok, true);

  await new Promise((resolve) => setTimeout(resolve, 30));
});
