const SUPPORTED_TRANSPORTS = new Set(['http', 'sse', 'websocket', 'ipc']);

const BRIDGE_METHODS = [
  'connect',
  'openProject',
  'openChange',
  'updateContext',
  'publishDiagnostics',
  'publishFilesystemEvents',
  'publishCommandEvents',
  'publishImplementationEvents'
];

const REQUIRED_CONTEXT_FIELDS = [
  'projectId',
  'changeSessionId',
  'participantId'
];

function validateConnectionRequest(request = {}) {
  const transport = String(request.transport || 'http').toLowerCase();
  if (!SUPPORTED_TRANSPORTS.has(transport)) {
    throw new Error(`Unsupported IDE bridge transport: ${transport}`);
  }
  const participantId = String(request.participantId || '').trim();
  const surfaceId = String(request.surfaceId || '').trim();
  if (!participantId) throw new Error('connection.participantId is required');
  if (!surfaceId) throw new Error('connection.surfaceId is required');
  return {
    transport,
    participantId,
    surfaceId,
    clientVersion: String(request.clientVersion || '0.0.0'),
    metadata: request.metadata && typeof request.metadata === 'object' ? request.metadata : {}
  };
}

function validateOpenProjectRequest(request = {}) {
  const projectId = String(request.projectId || '').trim();
  const repositoryRoot = String(request.repositoryRoot || '').trim();
  if (!projectId) throw new Error('openProject.projectId is required');
  if (!repositoryRoot) throw new Error('openProject.repositoryRoot is required');
  return {
    projectId,
    repositoryRoot,
    projectName: String(request.projectName || projectId),
    supportedSurfaces: Array.isArray(request.supportedSurfaces) ? request.supportedSurfaces.filter(Boolean) : []
  };
}

function validateOpenChangeRequest(request = {}) {
  const changeSessionId = String(request.changeSessionId || '').trim();
  const projectId = String(request.projectId || '').trim();
  if (!changeSessionId) throw new Error('openChange.changeSessionId is required');
  if (!projectId) throw new Error('openChange.projectId is required');
  return {
    changeSessionId,
    projectId,
    title: String(request.title || changeSessionId),
    intent: String(request.intent || ''),
    files: Array.isArray(request.files) ? request.files.filter(Boolean) : [],
    constraints: Array.isArray(request.constraints) ? request.constraints.filter(Boolean) : []
  };
}

function validateContextUpdate(update = {}) {
  for (const field of REQUIRED_CONTEXT_FIELDS) {
    if (!String(update[field] || '').trim()) {
      throw new Error(`updateContext.${field} is required`);
    }
  }
  return {
    projectId: String(update.projectId),
    changeSessionId: String(update.changeSessionId),
    participantId: String(update.participantId),
    contextRevision: Number.isFinite(Number(update.contextRevision)) ? Number(update.contextRevision) : 0,
    payload: update.payload && typeof update.payload === 'object' ? update.payload : {}
  };
}

module.exports = {
  BRIDGE_METHODS,
  SUPPORTED_TRANSPORTS,
  validateConnectionRequest,
  validateOpenProjectRequest,
  validateOpenChangeRequest,
  validateContextUpdate
};
