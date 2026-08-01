function summarizeCompletionRequirements({ requirements = [], interventions = [], reviewQueue = {} }) {
  const has = (type) => requirements.some((entry) => entry.type === type && entry.status === 'open');
  const openInterventions = interventions.some((entry) => ['open', 'acknowledged', 'in-progress', 'escalated'].includes(entry.status));
  const humanDecision = (reviewQueue.items || []).some((entry) => entry.requiresHumanApproval);

  return {
    coordination: has('coordination') ? 'incomplete' : 'pass',
    context: has('context-refresh') ? 'incomplete' : 'pass',
    decisions: has('decision') || humanDecision ? 'incomplete' : 'pass',
    interventions: openInterventions ? 'incomplete' : 'pass',
    evidence: has('evidence') ? 'incomplete' : 'pass',
    verification: has('verification') ? 'incomplete' : 'pass',
    assurance: has('review') ? 'warning' : 'pass'
  };
}

module.exports = {
  summarizeCompletionRequirements
};
