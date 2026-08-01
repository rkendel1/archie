function evaluateArchitecture({ topologyConformance = {}, conflicts = [] } = {}) {
  if (topologyConformance.status === 'drift') {
    return {
      status: 'WARNING',
      details: topologyConformance.drifts.map((drift) => drift.message)
    };
  }
  if (conflicts.some((entry) => entry.severity === 'high')) {
    return {
      status: 'WARNING',
      details: ['High-severity work conflicts may cause architecture drift']
    };
  }
  return { status: 'PASS', details: ['Architecture intent conforms to observed topology'] };
}

module.exports = {
  evaluateArchitecture
};
