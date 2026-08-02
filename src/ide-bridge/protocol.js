const SUPPORTED_TRANSPORTS = new Set(['http', 'sse', 'websocket', 'ipc']);

const BRIDGE_METHODS = [
  'connect',
  'disconnect',
  'openProject',
  'openChange',
  'updateContext',
  'publishDiagnostics',
  'publishFilesystemEvents',
  'publishCommandEvents',
  'publishImplementationEvents',
  'registerPlugin',
  'pluginReady',
  'pluginStartupFailed',
  'pluginShutdown',
  'registerRuntimeCapabilities',
  'reportPluginHealth',
  'routeCapability',
  'executeCapability'
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
    pluginId: String(request.pluginId || '').trim() || null,
    voltManifest: request.voltManifest && typeof request.voltManifest === 'object' ? request.voltManifest : {},
    capabilities: Array.isArray(request.capabilities) ? request.capabilities.filter((entry) => entry && typeof entry === 'object') : [],
    clientVersion: String(request.clientVersion || '0.0.0'),
    metadata: request.metadata && typeof request.metadata === 'object' ? request.metadata : {}
  };
}

function validateDisconnectRequest(request = {}) {
  const connectionId = String(request.connectionId || '').trim();
  if (!connectionId) throw new Error('disconnect.connectionId is required');
  return { connectionId, reason: String(request.reason || 'disconnect-requested') };
}

function validateFabricRegistrationRequest(request = {}) {
  const participantId = String(request.participantId || '').trim();
  const surfaceId = String(request.surfaceId || '').trim();
  if (!participantId) throw new Error('registerPlugin.participantId is required');
  if (!surfaceId) throw new Error('registerPlugin.surfaceId is required');
  return {
    pluginId: String(request.pluginId || '').trim() || null,
    participantId,
    surfaceId,
    voltManifest: request.voltManifest && typeof request.voltManifest === 'object' ? request.voltManifest : {},
    capabilities: Array.isArray(request.capabilities) ? request.capabilities.filter((entry) => entry && typeof entry === 'object') : [],
    concurrencyLimits: request.concurrencyLimits && typeof request.concurrencyLimits === 'object' ? request.concurrencyLimits : {},
    permissionGrant: request.permissionGrant && typeof request.permissionGrant === 'object' ? request.permissionGrant : {},
    metadata: request.metadata && typeof request.metadata === 'object' ? request.metadata : {}
  };
}

function validateFabricRegistrationReference(request = {}, method) {
  const registrationId = String(request.registrationId || '').trim();
  const pluginId = String(request.pluginId || '').trim();
  if (!registrationId && !pluginId) throw new Error(`${method}.registrationId or ${method}.pluginId is required`);
  return {
    registrationId: registrationId || null,
    pluginId: pluginId || null
  };
}

function validateRuntimeCapabilityRegistrationRequest(request = {}) {
  const registrationId = String(request.registrationId || '').trim();
  const registrationToken = String(request.registrationToken || '').trim();
  if (!registrationId) throw new Error('registerRuntimeCapabilities.registrationId is required');
  if (!registrationToken) throw new Error('registerRuntimeCapabilities.registrationToken is required');
  return {
    registrationId,
    registrationToken,
    capabilities: Array.isArray(request.capabilities) ? request.capabilities.filter((entry) => entry && typeof entry === 'object') : []
  };
}

function validateReportHealthRequest(request = {}) {
  const registrationId = String(request.registrationId || '').trim();
  const registrationToken = String(request.registrationToken || '').trim();
  const health = String(request.health || '').trim();
  if (!registrationId) throw new Error('reportPluginHealth.registrationId is required');
  if (!registrationToken) throw new Error('reportPluginHealth.registrationToken is required');
  if (!health) throw new Error('reportPluginHealth.health is required');
  return { registrationId, registrationToken, health };
}

function validateCapabilityRequest(request = {}, method = 'routeCapability') {
  const namespace = String(request.namespace || '').trim();
  const operation = String(request.operation || '').trim();
  if (!namespace) throw new Error(`${method}.namespace is required`);
  if (!operation) throw new Error(`${method}.operation is required`);
  return {
    namespace,
    operation,
    language: request.language == null ? null : String(request.language).trim(),
    payload: request.payload,
    deadline: request.deadline == null ? null : request.deadline
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
  validateDisconnectRequest,
  validateOpenProjectRequest,
  validateOpenChangeRequest,
  validateContextUpdate,
  validateFabricRegistrationRequest,
  validateFabricRegistrationReference,
  validateRuntimeCapabilityRegistrationRequest,
  validateReportHealthRequest,
  validateCapabilityRequest
};
