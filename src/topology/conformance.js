function assessTopologyConformance(intent = {}, topology = {}, proposal = {}) {
  const drifts = [];
  const runtimeRules = Array.isArray(intent.runtimeRules) ? intent.runtimeRules : [];
  const ownershipRules = Array.isArray(intent.ownershipRules) ? intent.ownershipRules : [];

  for (const rule of runtimeRules) {
    if (rule.requiredRuntime && !topology.runtimes.some((runtime) => runtime.name === rule.requiredRuntime)) {
      drifts.push({
        type: 'ARCHITECTURE_DRIFT',
        severity: 'high',
        message: `Required runtime missing: ${rule.requiredRuntime}`
      });
    }
  }

  for (const rule of ownershipRules) {
    const owner = topology.capabilityOwnership.find((entry) => entry.capability === rule.capability);
    if (owner && owner.runtime !== rule.runtime) {
      drifts.push({
        type: 'ARCHITECTURE_DRIFT',
        severity: 'critical',
        message: `Declared owner for ${rule.capability} is ${rule.runtime}; observed ${owner.runtime}`
      });
    }
  }

  for (const change of proposal.proposedOwnership || []) {
    const canonical = topology.capabilityOwnership.find((entry) => entry.capability === change.capability);
    if (canonical && canonical.runtime !== change.runtime) {
      drifts.push({
        type: 'ARCHITECTURE_DRIFT',
        severity: 'critical',
        message: `New execution path for ${change.capability} creates competing runtime ownership`
      });
    }
  }

  return {
    status: drifts.length ? 'drift' : 'conformant',
    drifts
  };
}

module.exports = {
  assessTopologyConformance
};
