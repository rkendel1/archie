const { makeAgentId } = require('./agent-identity');
const { createAgentSession } = require('./agent-session');

class AgentRegistry {
  constructor(repositoryId) {
    this.repositoryId = repositoryId;
    this.sessions = new Map();
  }

  register(input = {}) {
    const agentId = makeAgentId(input.id || input.agent_id || input.name);
    const session = createAgentSession({
      agentId,
      name: input.name,
      capabilities: input.capabilities,
      repositoryId: this.repositoryId
    });
    this.sessions.set(session.session_id, session);
    return session;
  }

  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }
}

module.exports = {
  AgentRegistry
};
