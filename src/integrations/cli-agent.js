const crypto = require('node:crypto');

function createLocalCliAgent(name = 'Local Coding Agent') {
  return {
    id: `coding-agent-${crypto.randomUUID().slice(0, 8)}`,
    name,
    capabilities: ['read', 'write', 'plan', 'verify']
  };
}

module.exports = {
  createLocalCliAgent
};
