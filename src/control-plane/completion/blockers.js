function deriveCompletionBlockers({ requirements = [], interventions = [] }) {
  const blockers = [];
  for (const requirement of requirements) {
    if (requirement.status !== 'open') continue;
    blockers.push({
      type: requirement.type.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
      requirementId: requirement.id,
      reason: requirement.reason
    });
  }
  for (const intervention of interventions) {
    if (!['open', 'acknowledged', 'in-progress', 'escalated'].includes(intervention.status)) continue;
    blockers.push({
      type: intervention.type,
      interventionId: intervention.id,
      reason: intervention.reason
    });
  }
  return blockers;
}

module.exports = {
  deriveCompletionBlockers
};
