const { makeAgentSessionId } = require('./agent-identity');
const { normalizeCapabilities } = require('./agent-capabilities');

function createAgentSession({ agentId, name, capabilities, repositoryId, protocolVersion = '1.0' }) {
  const now = new Date().toISOString();
  return {
    agent_id: agentId,
    session_id: makeAgentSessionId(),
    name: name || agentId,
    capabilities: normalizeCapabilities(capabilities),
    repository_id: repositoryId,
    protocol_version: protocolVersion,
    created_at: now,
    updated_at: now
  };
}

module.exports = {
  createAgentSession
};
