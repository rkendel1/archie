function classifyReviewRisk({ matrix = {}, conflicts = [], drift = [] } = {}) {
  const dims = matrix.dimensions || {};
  const warningCount = Object.values(dims).filter((entry) => entry?.status === 'WARNING').length;
  const notVerifiedCount = Object.values(dims).filter((entry) => entry?.status === 'NOT VERIFIED').length;
  const hasCriticalConflict = conflicts.some((entry) => entry.severity === 'high') || drift.some((entry) => entry.severity === 'critical');
  if (hasCriticalConflict) return { level: 'CRITICAL', reason: 'Runtime ownership or contract conflict detected' };
  if (warningCount >= 2) return { level: 'HIGH', reason: 'Multiple assurance warnings require human decision' };
  if (warningCount || notVerifiedCount) return { level: 'MEDIUM', reason: 'Shared capability or evidence requires review' };
  return { level: 'LOW', reason: 'Scoped implementation with complete evidence' };
}

module.exports = {
  classifyReviewRisk
};
