const crypto = require('node:crypto');

function makeAgentId(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized || `agent-${crypto.randomUUID().slice(0, 8)}`;
}

function makeAgentSessionId() {
  return `agent_session_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
}

module.exports = {
  makeAgentId,
  makeAgentSessionId
};
