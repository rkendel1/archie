const { createLocalCliAgent } = require('./cli-agent');

function startLocalAgent(name) {
  return createLocalCliAgent(name);
}

module.exports = {
  startLocalAgent
};
