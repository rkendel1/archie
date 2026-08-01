function evaluateTransition({ transition, requirements = [], interventions = [] }) {
  const blockingRequirementTypes = new Set(['coordination', 'context-refresh', 'evidence', 'decision', 'review', 'verification']);
  const pendingRequirements = requirements.filter((entry) => entry.status === 'open' || entry.status === 'in-progress');
  const openInterventions = interventions.filter((entry) => ['open', 'acknowledged', 'in-progress', 'escalated'].includes(entry.status));

  const blocksCompletion = transition === 'complete' && (pendingRequirements.some((entry) => blockingRequirementTypes.has(entry.type)) || openInterventions.length > 0);
  const blocksReview = transition === 'review' && pendingRequirements.some((entry) => ['coordination', 'context-refresh', 'evidence', 'decision'].includes(entry.type));
  const blocksVerify = transition === 'verify' && pendingRequirements.some((entry) => ['coordination', 'context-refresh'].includes(entry.type));

  const blocked = blocksCompletion || blocksReview || blocksVerify;
  const status = blocked
    ? (pendingRequirements.length || openInterventions.length ? 'requirements-pending' : 'blocked')
    : (pendingRequirements.length ? 'allowed-with-warnings' : 'allowed');

  return {
    allowed: !blocked,
    status,
    requirements: pendingRequirements,
    interventions: openInterventions,
    explanation: blocked
      ? `Transition ${transition} blocked until ${Math.max(1, pendingRequirements.length + openInterventions.length)} requirement(s) are satisfied.`
      : `Transition ${transition} is allowed.`
  };
}

module.exports = {
  evaluateTransition
};
