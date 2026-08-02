const { BRIDGE_METHODS } = require('./protocol');
const { createEventStore } = require('./events');
const { createSessions } = require('./sessions');
const { createConnectionController } = require('./connection');
const { createProjectController } = require('./project-context');
const { createChangeController } = require('./change-context');
const { normalizeDiagnostics } = require('./diagnostics');
const { normalizeFilesystemEvents } = require('./filesystem');
const { normalizeCommandEvents } = require('./commands');

const DEFAULT_IMPLEMENTATIONS = {
  primary: {
    id: 'archie-lapce',
    ide: 'lapce',
    role: 'native-substrate',
    status: 'primary'
  },
  secondary: [
    { id: 'zed', ide: 'zed', role: 'integration-target', status: 'secondary' },
    { id: 'vs-code', ide: 'vs-code', role: 'integration-target', status: 'secondary' },
    { id: 'cursor', ide: 'cursor', role: 'integration-target', status: 'secondary' },
    { id: 'jetbrains', ide: 'jetbrains', role: 'integration-target', status: 'secondary' }
  ]
};

function createIdeBridge() {
  const events = createEventStore();
  const sessions = createSessions();
  const connection = createConnectionController(sessions, events);
  const project = createProjectController(sessions, events);
  const change = createChangeController(sessions, events);

  return {
    implementations: DEFAULT_IMPLEMENTATIONS,
    protocolMethods: BRIDGE_METHODS.slice(),
    connect(request) {
      return connection.connect(request);
    },
    openProject(request) {
      return project.openProject(request);
    },
    openChange(request) {
      return change.openChange(request);
    },
    updateContext(update) {
      return change.updateContext(update);
    },
    publishDiagnostics(diagnostics = []) {
      const normalized = normalizeDiagnostics(diagnostics);
      const payload = { diagnostics: normalized };
      events.append('diagnostics.published', payload);
      return payload;
    },
    publishFilesystemEvents(filesystemEvents = []) {
      const normalized = normalizeFilesystemEvents(filesystemEvents);
      const payload = { events: normalized };
      events.append('filesystem.published', payload);
      return payload;
    },
    publishCommandEvents(commandEvents = []) {
      const normalized = normalizeCommandEvents(commandEvents);
      const payload = { events: normalized };
      events.append('commands.published', payload);
      return payload;
    },
    publishImplementationEvents(implementationEvents = []) {
      const payload = {
        events: Array.isArray(implementationEvents) ? implementationEvents.filter((entry) => entry && typeof entry === 'object') : []
      };
      events.append('implementation.published', payload);
      return payload;
    },
    snapshot() {
      return {
        implementations: DEFAULT_IMPLEMENTATIONS,
        protocolMethods: BRIDGE_METHODS.slice(),
        sessions: sessions.summary(),
        events: events.list()
      };
    }
  };
}

module.exports = {
  BRIDGE_METHODS,
  DEFAULT_IMPLEMENTATIONS,
  createIdeBridge
};
