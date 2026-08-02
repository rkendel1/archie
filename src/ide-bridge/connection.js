const {
  validateConnectionRequest,
  validateDisconnectRequest,
  validateFabricRegistrationRequest,
  validateFabricRegistrationReference,
  validateRuntimeCapabilityRegistrationRequest,
  validateReportHealthRequest,
  validateCapabilityRequest
} = require('./protocol');

function createConnectionController(sessions, events, fabric) {
  return {
    connect(request) {
      const normalized = validateConnectionRequest(request);
      const lifecycle = fabric.register({
        pluginId: normalized.pluginId,
        participantId: normalized.participantId,
        surfaceId: normalized.surfaceId,
        voltManifest: normalized.voltManifest,
        capabilities: normalized.capabilities,
        metadata: normalized.metadata
      });
      fabric.markReady({ registrationId: lifecycle.registrationId });
      const connection = sessions.registerConnection({
        ...normalized,
        pluginId: lifecycle.pluginId,
        fabricRegistrationId: lifecycle.registrationId
      });
      events.append('bridge.connected', {
        ...connection,
        pluginId: lifecycle.pluginId,
        fabricRegistrationId: lifecycle.registrationId
      });
      return {
        connectionId: connection.connectionId,
        transport: connection.transport,
        participantId: connection.participantId,
        surfaceId: connection.surfaceId,
        pluginId: lifecycle.pluginId,
        fabricRegistrationId: lifecycle.registrationId,
        fabricRegistrationToken: lifecycle.registrationToken,
        connectedAt: connection.connectedAt
      };
    },
    disconnect(request) {
      const normalized = validateDisconnectRequest(request);
      const connection = sessions.unregisterConnection(normalized.connectionId);
      if (!connection) throw new Error(`Unknown connection: ${normalized.connectionId}`);
      if (connection.pluginId) fabric.stop({ pluginId: connection.pluginId, reason: normalized.reason });
      events.append('bridge.disconnected', { ...connection, disconnectedAt: new Date().toISOString(), reason: normalized.reason });
      return {
        connectionId: normalized.connectionId,
        disconnected: true,
        reason: normalized.reason
      };
    },
    registerPlugin(request) {
      const normalized = validateFabricRegistrationRequest(request);
      const registration = fabric.register(normalized);
      events.append('fabric.plugin.registered', registration);
      return registration;
    },
    pluginReady(request) {
      const normalized = validateFabricRegistrationReference(request, 'pluginReady');
      const ready = fabric.markReady(normalized);
      events.append('fabric.plugin.ready', ready);
      return ready;
    },
    pluginStartupFailed(request) {
      const normalized = validateFabricRegistrationReference(request, 'pluginStartupFailed');
      fabric.startupFailed({ ...normalized, error: request.error });
      events.append('fabric.plugin.startup-failed', { ...normalized, error: request.error || 'startup-failed' });
      return { ok: true };
    },
    pluginShutdown(request) {
      const normalized = validateFabricRegistrationReference(request, 'pluginShutdown');
      const stopped = fabric.stop({ ...normalized, reason: request.reason || 'shutdown-requested' });
      events.append('fabric.plugin.shutdown', { ...normalized, stopped, reason: request.reason || 'shutdown-requested' });
      return { ok: true, stopped };
    },
    registerRuntimeCapabilities(request) {
      const normalized = validateRuntimeCapabilityRegistrationRequest(request);
      const updated = fabric.registerCapabilities(normalized);
      events.append('fabric.capabilities.updated', { registrationId: normalized.registrationId });
      return updated;
    },
    reportPluginHealth(request) {
      const normalized = validateReportHealthRequest(request);
      const updated = fabric.reportHealth(normalized);
      events.append('fabric.health.reported', { registrationId: normalized.registrationId, health: normalized.health });
      return updated;
    },
    routeCapability(request) {
      const normalized = validateCapabilityRequest(request, 'routeCapability');
      const route = fabric.route(normalized, request.routeContext || {});
      events.append('fabric.route.resolved', { request: normalized, route });
      return route;
    },
    executeCapability(request) {
      const normalized = validateCapabilityRequest(request, 'executeCapability');
      events.append('fabric.execution.requested', { request: normalized });
      return fabric.execute({
        capability: normalized,
        payload: normalized.payload,
        deadline: normalized.deadline,
        requestId: request.requestId,
        routeContext: request.routeContext || {},
        signal: request.signal || null
      });
    }
  };
}

module.exports = { createConnectionController };
