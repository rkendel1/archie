const { evaluateTransition } = require('./gates');

function buildExecutionPermissions({ requirements = [], interventions = [] }) {
  const transitions = ['start', 'plan', 'implement', 'verify', 'review', 'complete'];
  const permissions = {};
  for (const transition of transitions) {
    permissions[transition] = evaluateTransition({ transition, requirements, interventions });
  }
  return permissions;
}

module.exports = {
  buildExecutionPermissions
};
