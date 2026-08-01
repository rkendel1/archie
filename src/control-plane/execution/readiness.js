function deriveExecutionStatus({ requirements = [], interventions = [], reviewState = {} }) {
  const hasOpenCoordination = requirements.some((entry) => entry.type === 'coordination' && entry.status === 'open');
  const hasOpenContext = requirements.some((entry) => entry.type === 'context-refresh' && entry.status === 'open');
  const hasOpenEvidence = requirements.some((entry) => entry.type === 'evidence' && entry.status === 'open');
  const hasOpenDecision = requirements.some((entry) => entry.type === 'decision' && entry.status === 'open');
  const hasOpenReview = requirements.some((entry) => entry.type === 'review' && entry.status === 'open') || reviewState.requiresHumanDecision;
  const hasBlockingIntervention = interventions.some((entry) => ['open', 'acknowledged', 'in-progress', 'escalated'].includes(entry.status));

  if (hasOpenCoordination) return 'coordination-required';
  if (hasOpenContext) return 'context-refresh-required';
  if (hasOpenEvidence) return 'evidence-required';
  if (hasOpenDecision) return 'decision-required';
  if (hasOpenReview) return 'review-required';
  if (hasBlockingIntervention) return 'completion-blocked';
  return 'verification-ready';
}

module.exports = {
  deriveExecutionStatus
};
