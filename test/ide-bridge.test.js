const test = require('node:test');
const assert = require('node:assert/strict');

const { createIdeBridge, DEFAULT_IMPLEMENTATIONS, BRIDGE_METHODS } = require('../src/ide-bridge');

test('archie ide bridge exposes lapce-first implementation metadata', () => {
  const bridge = createIdeBridge();
  const snapshot = bridge.snapshot();

  assert.equal(snapshot.implementations.primary.ide, 'lapce');
  assert.equal(snapshot.implementations.primary.id, 'archie-lapce');
  assert.ok(snapshot.implementations.secondary.some((entry) => entry.ide === 'zed'));
  assert.deepEqual(snapshot.protocolMethods, BRIDGE_METHODS);
});

test('archie ide bridge supports canonical connect/open/publish flow', () => {
  const bridge = createIdeBridge();

  const connected = bridge.connect({
    transport: 'http',
    participantId: 'participant-you',
    surfaceId: 'archie-lapce'
  });
  assert.ok(connected.connectionId.startsWith('ide_connection_'));

  const openedProject = bridge.openProject({
    projectId: 'project-1',
    projectName: 'Archie',
    repositoryRoot: '/repo',
    supportedSurfaces: ['archie-lapce', 'zed']
  });
  assert.equal(openedProject.projectId, 'project-1');

  const openedChange = bridge.openChange({
    changeSessionId: 'change-1',
    projectId: 'project-1',
    title: 'Add IDE bridge',
    files: ['src/ide-bridge/index.js']
  });
  assert.equal(openedChange.changeSessionId, 'change-1');

  const context = bridge.updateContext({
    projectId: 'project-1',
    changeSessionId: 'change-1',
    participantId: 'participant-you',
    contextRevision: 4,
    payload: { workClaims: [{ path: 'src/ide-bridge/index.js', participantId: 'participant-you' }] }
  });
  assert.equal(context.contextRevision, 4);

  const diagnostics = bridge.publishDiagnostics([
    { source: 'rust-analyzer', severity: 'error', file: 'src/main.rs', message: 'example' }
  ]);
  assert.equal(diagnostics.diagnostics.length, 1);

  const fsEvents = bridge.publishFilesystemEvents([
    { type: 'file.changed', path: 'src/main.rs', attribution: 'human', confidence: 'confirmed' }
  ]);
  assert.equal(fsEvents.events.length, 1);

  const commandEvents = bridge.publishCommandEvents([
    { command: 'cargo test --workspace', participantId: 'participant-you', intent: 'verify', exitCode: 0 }
  ]);
  assert.equal(commandEvents.events[0].command, 'cargo test --workspace');

  const implementationEvents = bridge.publishImplementationEvents([{ type: 'agent.diff.proposed', files: 3 }]);
  assert.equal(implementationEvents.events.length, 1);

  const snapshot = bridge.snapshot();
  assert.equal(snapshot.sessions.activeConnections, 1);
  assert.equal(snapshot.sessions.openProjects, 1);
  assert.equal(snapshot.sessions.openChanges, 1);
  assert.ok(snapshot.events.length >= 8);
  assert.equal(DEFAULT_IMPLEMENTATIONS.primary.ide, 'lapce');
});
