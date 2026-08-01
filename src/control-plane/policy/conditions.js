function hasWorkConflicts(snapshot = {}) {
  return (snapshot.coordination?.conflicts || []).length > 0;
}

function hasDuplicateWork(snapshot = {}) {
  return (snapshot.coordination?.duplicates || []).length > 0;
}

function hasStaleContext(snapshot = {}) {
  return (snapshot.context?.invalidations || []).length > 0;
}

function hasRuntimeOwnershipIssue(snapshot = {}) {
  return (snapshot.architectureConformance?.drifts || []).some((entry) =>
    String(entry.type || '').includes('ARCHITECTURE_DRIFT') || String(entry.type || '').includes('RUNTIME')
  );
}

function hasContractDrift(snapshot = {}) {
  return (snapshot.contracts?.drift || []).length > 0;
}

function hasMissingEvidence(snapshot = {}) {
  const entries = snapshot.evidenceState || [];
  return entries.some((entry) => ['missing', 'stale', 'failed'].includes(entry.status));
}

function hasUnresolvedRisk(snapshot = {}) {
  return (snapshot.reviewQueue?.items || []).some((item) => item.requiresHumanApproval);
}

function needsDependencyOrdering(snapshot = {}) {
  return (snapshot.dependencyGraph?.conflicts || []).length > 0;
}

function isCompletionReady(snapshot = {}) {
  return !hasWorkConflicts(snapshot)
    && !hasContractDrift(snapshot)
    && !hasMissingEvidence(snapshot)
    && !hasUnresolvedRisk(snapshot)
    && !hasStaleContext(snapshot);
}

module.exports = {
  hasWorkConflicts,
  hasDuplicateWork,
  hasStaleContext,
  hasRuntimeOwnershipIssue,
  hasContractDrift,
  hasMissingEvidence,
  hasUnresolvedRisk,
  needsDependencyOrdering,
  isCompletionReady
};
