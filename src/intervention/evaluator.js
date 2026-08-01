const { evaluateRules } = require('./rules');
const { prioritize } = require('./prioritizer');
const { hydrate } = require('./lifecycle');

function evaluateInterventions(context = {}) {
  const findings = evaluateRules(context);
  const ordered = prioritize(findings);
  return hydrate(ordered, context);
}

module.exports = {
  evaluateInterventions
};
