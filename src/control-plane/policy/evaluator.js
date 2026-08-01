const { createPolicyEvaluation } = require('./policy-result');
const { comparePriority } = require('./priorities');

function evaluatePolicies(policies = [], snapshot = {}) {
  const evaluations = policies
    .map((policy) => createPolicyEvaluation(policy, snapshot))
    .sort((a, b) => comparePriority(a.policy.priority, b.policy.priority));

  return {
    evaluations,
    violated: evaluations.filter((entry) => entry.status === 'violated'),
    uncertain: evaluations.filter((entry) => entry.status === 'uncertain')
  };
}

module.exports = {
  evaluatePolicies
};
