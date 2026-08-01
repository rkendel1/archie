function createCompletionReport(input = {}) {
  return {
    intent: input.intent || 'understood',
    plan: input.plan || 'approved',
    implementation: input.implementation || 'observed',
    architecture: input.architecture || 'verified',
    runtime: input.runtime || 'verified',
    contracts: input.contracts || 'verified',
    evidence: input.evidence || { required: 0, current: 0 },
    assurance: Number(input.assurance || 0),
    result: input.result || 'review_required'
  };
}

module.exports = {
  createCompletionReport
};
