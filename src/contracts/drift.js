function detectContractRepresentationDrift(canonicalContract = {}) {
  const reps = canonicalContract.representations || [];
  const issues = [];
  const compatibility = canonicalContract.compatibility || {};
  if (compatibility.state === 'breaking') {
    issues.push({
      type: 'CONTRACT_REPRESENTATION_DRIFT',
      contract: canonicalContract.name,
      severity: 'critical',
      message: `${canonicalContract.name} has incompatible representations`,
      affectedConsumers: (canonicalContract.consumers || []).map((entry) => entry.id),
      representations: reps.map((entry) => entry.file)
    });
  }
  const byKind = new Map();
  for (const rep of reps) {
    byKind.set(rep.kind, (byKind.get(rep.kind) || 0) + 1);
  }
  for (const [kind, count] of byKind.entries()) {
    if (count > 1 && /implementation/.test(kind)) {
      issues.push({
        type: 'CONTRACT_REPRESENTATION_DRIFT',
        contract: canonicalContract.name,
        severity: 'high',
        message: `Multiple implementation representations detected for ${canonicalContract.name}`
      });
    }
  }
  return issues;
}

module.exports = {
  detectContractRepresentationDrift
};
