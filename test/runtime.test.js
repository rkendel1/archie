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
  assert.equal(session.change_room.status, 'active');
  assert.ok(session.change_room.buzz.dependency.pinnedCommit);

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

test('runtime server supports agent participation workflow', async () => {
  const repo = makeRepo();
  const server = await startRuntimeServer(repo, { port: 0 });

  const protocol = await request(server.baseUrl, 'GET', '/v1/agent/protocol');
  assert.equal(protocol.protocol_version, '1.0');

  const agent = await request(server.baseUrl, 'POST', '/v1/agent/sessions', {
    id: 'coding-agent-01',
    name: 'Local Coding Agent',
    capabilities: ['read', 'write', 'plan', 'verify']
  });
  assert.equal(agent.agent_id, 'coding-agent-01');

  const intent = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/intent`, {
    intent: {
      outcome: 'Add dataset insight capabilities',
      constraints: [{ type: 'architecture', value: 'Reuse existing Worker Runtime' }]
    }
  });
  assert.equal(intent.agent_session_id, agent.session_id);
  assert.equal(intent.intent.status, 'understood');

  const room = await request(server.baseUrl, 'GET', '/v1/changes/active/room');
  assert.equal(room.room.changeSessionId, intent.id);
  assert.ok(room.room.participants.some((participant) => participant.role === 'system-intelligence-advisor'));
  assert.ok(room.room.participants.some((participant) => participant.role === 'implementation-advisor'));

  const context = await request(server.baseUrl, 'GET', `/v1/agent/sessions/${agent.session_id}/context?detail=focused`);
  assert.ok(Array.isArray(context.constraints));
  assert.ok(Array.isArray(context.required_evidence));

  const proposal = await request(server.baseUrl, 'POST', '/v1/changes/proposals', {
    actor: { type: 'agent', id: 'coding-agent-01', name: 'Local Coding Agent' },
    intent: { summary: 'Add anomaly detection to analytics', desiredOutcome: 'Add anomaly detection to analytics' },
    files: ['src/runtime-manifest.ts', 'src/analytics-worker.rs'],
    contracts: ['RuntimeManifest v2'],
    constraints: { preserveContracts: true, preserveRuntimeCompatibility: true }
  });
  assert.ok(proposal.proposal.id.startsWith('proposal_'));

  const plan = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/plans`, {
    steps: [{ action: 'add_capability', target: 'dataset-insight' }],
    files: ['src/runtime/runtime-manifest.ts']
  });
  assert.ok(plan.id.startsWith('plan_'));
  assert.equal(typeof plan.review.plan_assurance, 'number');

  const plans = await request(server.baseUrl, 'GET', `/v1/agent/sessions/${agent.session_id}/plans`);
  assert.ok(plans.plans.length >= 1);

  const declaration = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/files`, {
    files: ['src/runtime/runtime-manifest.ts']
  });
  assert.deepEqual(declaration.declared_files, ['src/runtime/runtime-manifest.ts']);

  const implementation = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/implementation`, {
    summary: 'Updated runtime manifest',
    changes: [{ file: 'src/runtime/runtime-manifest.ts', action: 'modified' }]
  });
  assert.equal(implementation.status, 'implemented');

  const evidence = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/evidence`, {
    evidence: [{ type: 'runtime-registration', result: 'passed', command: 'npm test -- runtime' }]
  });
  assert.equal(evidence.classification.verified, 1);

  const verify = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/verify`);
  assert.equal(typeof verify.ok, 'boolean');

  const review = await request(server.baseUrl, 'POST', '/v1/changes/review');
  assert.ok(['APPROVED', 'CONSTRAINED'].includes(review.status));
  assert.ok(Array.isArray(review.interventions));

  const guidance = await request(server.baseUrl, 'GET', '/v1/changes/guidance');
  assert.equal(guidance.status, review.status);

  const challenge = await request(server.baseUrl, 'POST', '/v1/changes/active/participants', {
    identity: { type: 'llm', name: 'Independent Architecture LLM', provider: 'external' },
    role: 'independent-reasoning-advisor',
    capabilities: ['reasoning', 'challenge'],
    status: 'active'
  });
  assert.equal(challenge.participant.role, 'independent-reasoning-advisor');

  const contribution = await request(server.baseUrl, 'POST', '/v1/changes/active/contributions', {
    participantId: challenge.participant.id,
    kind: 'challenge',
    subject: { type: 'architecture' },
    content: { summary: 'Consider compatibility adapter before contract migration' }
  });
  assert.equal(contribution.contribution.kind, 'challenge');

  const contributions = await request(server.baseUrl, 'GET', '/v1/changes/active/contributions?kind=challenge');
  assert.ok(contributions.contributions.some((entry) => entry.id === contribution.contribution.id));

  const changeContext = await request(server.baseUrl, 'GET', `/v1/context/changes/${proposal.proposal.id}`);
  assert.equal(changeContext.change.id, proposal.proposal.id);
  assert.ok(Array.isArray(changeContext.requiredEvidence));

  const completion = await request(server.baseUrl, 'POST', `/v1/agent/sessions/${agent.session_id}/complete`);
  assert.ok(['ready_for_review', 'review_required'].includes(completion.result));

  const events = await request(server.baseUrl, 'GET', `/v1/agent/sessions/${agent.session_id}/events`);
  assert.ok(events.events.some((event) => event.type.startsWith('agent.')));

  await request(server.baseUrl, 'POST', '/v1/runtime/stop');
  await new Promise((resolve) => setTimeout(resolve, 30));
});
