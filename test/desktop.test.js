const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startDesktopServer } = require('../src/desktop');

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'archie-desktop-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture-desktop',
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

function closeServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('desktop command center supports project workspaces and room collaboration', async () => {
  const repo = makeRepo();
  const statePath = path.join(os.tmpdir(), `archie-desktop-state-${Date.now()}-${Math.random()}.json`);
  const server = startDesktopServer({ port: 0, statePath });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const opened = await request(baseUrl, 'POST', '/api/projects/open', { repo });
  assert.equal(opened.ok, true);
  assert.equal(opened.project.runtime.status, 'connected');
  assert.equal(typeof opened.project.summary.activeChanges, 'number');

  const selected = await request(baseUrl, 'POST', '/api/projects/select', {
    projectId: opened.project.id,
    route: '/changes/active'
  });
  assert.equal(selected.restoredRoute, '/changes/active');

  fs.writeFileSync(path.join(repo, 'src', 'new-capability-service.js'), 'module.exports = {}\n');
  await request(baseUrl, 'POST', '/api/projects/select', {
    projectId: opened.project.id,
    route: '/overview'
  });

  const workspace = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/workspace`);
  assert.ok(workspace.navigation.changes >= 1);
  assert.equal(typeof workspace.navigation.reviewQueue, 'number');
  assert.ok(workspace.project.workspace.model.importantFiles.some((entry) => entry.file === 'src/new-capability-service.js'));
  assert.ok(workspace.sections.activeRoom);
  assert.ok(Array.isArray(workspace.sections.nextImplementations));
  assert.equal(workspace.sections.implementationFabric.primary.ide, 'lapce');
  assert.ok(workspace.sections.implementationFabric.externalSurfaces.some((entry) => entry.ide === 'zed'));
  assert.ok(workspace.sections.ideBridge.methods.includes('openChange'));
  assert.ok(workspace.sections.ideBridge.supportedImplementations.includes('archie-lapce'));

  const change = await request(baseUrl, 'POST', `/api/projects/${opened.project.id}/changes`, {
    title: 'Fix Python worker contract',
    outcome: 'Preserve compatibility for existing Python callers',
    participants: ['You', 'Archie', 'Coding Agent', 'External LLM']
  });
  assert.equal(change.change.title, 'Fix Python worker contract');

  const rooms = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/rooms?filter=my_changes`);
  assert.ok(rooms.rooms.length >= 1);

  const activeRoomId = rooms.rooms[0].id;
  const posted = await request(baseUrl, 'POST', `/api/projects/${opened.project.id}/rooms/${activeRoomId}/messages`, {
    sender: 'You',
    role: 'engineering-owner',
    text: '@archie can you explain the contract impact?'
  });
  assert.ok(posted.message.id.startsWith('msg_'));

  const roomStream = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/rooms/${activeRoomId}/messages`);
  assert.equal(roomStream.room.mentionsEnabled, true);
  assert.ok(roomStream.room.messages.some((entry) => entry.sender === 'Archie'));

  const notifications = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/notifications?unread=1`);
  assert.ok(notifications.notifications.some((entry) => entry.type === 'mention'));

  const recommendations = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/next-implementations`);
  assert.equal(recommendations.recommendations.length, 3);

  const reviewQueue = await request(baseUrl, 'GET', `/api/projects/${opened.project.id}/review-queue`);
  assert.equal(typeof reviewQueue.reviewQueue.summary.requiresDecision, 'number');

  await closeServer(server);

  const serverReloaded = startDesktopServer({ port: 0, statePath });
  await new Promise((resolve) => serverReloaded.once('listening', resolve));
  const reloadedUrl = `http://127.0.0.1:${serverReloaded.address().port}`;
  const active = await request(reloadedUrl, 'GET', '/api/projects/active');
  assert.equal(active.project.id, opened.project.id);
  assert.equal(active.restoredRoute, '/changes/active');

  await closeServer(serverReloaded);
});
