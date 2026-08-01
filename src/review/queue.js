const { classifyReviewRisk } = require('./risk');
const { escalationForRisk } = require('./escalation');
const { requiresHumanApproval } = require('./approvals');
const { summarizeQueue } = require('./decisions');

function buildReviewQueue(input = {}) {
  const items = (input.changes || []).map((change) => {
    const matrix = input.assuranceByChange[change.id] || { dimensions: {} };
    const drift = input.driftByChange[change.id] || [];
    const conflicts = input.conflictsByChange[change.id] || [];
    const risk = classifyReviewRisk({ matrix, drift, conflicts });
    const requiresApproval = requiresHumanApproval(risk);
    return {
      changeId: change.id,
      title: change.intent?.description || change.id,
      risk,
      escalation: escalationForRisk(risk),
      requiresHumanApproval: requiresApproval,
      matrixHealthy: !Object.values(matrix.dimensions || {}).some((entry) => entry.status === 'WARNING' || entry.status === 'NOT VERIFIED')
    };
  });
  return {
    items,
    summary: summarizeQueue(items)
  };
}

module.exports = {
  buildReviewQueue
};
