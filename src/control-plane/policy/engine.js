const { builtinPolicies } = require('./registry');
const { evaluatePolicies } = require('./evaluator');

function evaluateEngineeringPolicies(snapshot = {}, options = {}) {
  const policies = options.policies || builtinPolicies();
  const { evaluations, violated, uncertain } = evaluatePolicies(policies, snapshot);
  return {
    policies,
    evaluations,
    summary: {
      total: evaluations.length,
      violated: violated.length,
      uncertain: uncertain.length,
      satisfied: evaluations.filter((entry) => entry.status === 'satisfied').length
    }
  };
}

module.exports = {
  evaluateEngineeringPolicies
};
