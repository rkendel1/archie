function evaluateCompletionDecision(readiness = {}, input = {}) {
  const acceptedRisk = Boolean(input.acceptRisk && input.decisionId);
  if (readiness.status === 'ready') {
    return {
      accepted: true,
      status: 'completed',
      blockers: [],
      warnings: readiness.warnings || [],
      confidence: readiness.confidence
    };
  }

  if (acceptedRisk) {
    return {
      accepted: true,
      status: 'completed-with-accepted-risk',
      acceptedRisks: (readiness.blockers || []).map((entry) => ({
        interventionId: entry.interventionId || null,
        decisionId: input.decisionId
      })),
      blockers: readiness.blockers || [],
      warnings: readiness.warnings || [],
      confidence: readiness.confidence
    };
  }

  return {
    accepted: false,
    status: readiness.status || 'blocked',
    blockers: readiness.blockers || [],
    warnings: readiness.warnings || [],
    confidence: readiness.confidence || 0
  };
}

module.exports = {
  evaluateCompletionDecision
};
