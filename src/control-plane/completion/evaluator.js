const { summarizeCompletionRequirements } = require('./requirements');
const { deriveCompletionBlockers } = require('./blockers');
const { readinessStatus } = require('./readiness');

function evaluateCompletionReadiness({ requirements = [], interventions = [], reviewQueue = {} }) {
  const requirementSummary = summarizeCompletionRequirements({ requirements, interventions, reviewQueue });
  const blockers = deriveCompletionBlockers({ requirements, interventions });
  const status = readinessStatus(requirementSummary, blockers);
  return {
    status,
    requirements: requirementSummary,
    blockers,
    warnings: requirementSummary.assurance === 'warning' ? [{ type: 'ASSURANCE_WARNING', reason: 'Review escalation is pending.' }] : [],
    confidence: Number((status === 'ready' ? 0.94 : status === 'uncertain' ? 0.81 : 0.62).toFixed(2))
  };
}

module.exports = {
  evaluateCompletionReadiness
};
