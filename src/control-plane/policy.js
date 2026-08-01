const DEFAULT_POLICY = {
  staleEvidenceMaxAgeMs: 30 * 60 * 1000,
  highRiskWarningsThreshold: 2
};

function mergePolicy(overrides = {}) {
  return { ...DEFAULT_POLICY, ...(overrides || {}) };
}

module.exports = {
  DEFAULT_POLICY,
  mergePolicy
};
