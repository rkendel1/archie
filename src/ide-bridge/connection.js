const { validateConnectionRequest } = require('./protocol');

function createConnectionController(sessions, events) {
  return {
    connect(request) {
      const normalized = validateConnectionRequest(request);
      const connection = sessions.registerConnection(normalized);
      events.append('bridge.connected', connection);
      return {
        connectionId: connection.connectionId,
        transport: connection.transport,
        participantId: connection.participantId,
        surfaceId: connection.surfaceId,
        connectedAt: connection.connectedAt
      };
    }
  };
}

module.exports = { createConnectionController };
