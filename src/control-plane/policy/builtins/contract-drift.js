const { hasContractDrift } = require('../conditions');

function contractDriftPolicy() {
  return {
    id: 'contract-compatibility',
    name: 'Contract Compatibility Policy',
    description: 'Contract-bearing change cannot complete with unresolved compatibility risk.',
    domain: 'contract',
    priority: 'critical',
    appliesTo: { contracts: 'affected' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'high' },
      { type: 'REQUIRE_EVIDENCE', requirements: [{ type: 'contract', name: 'cross-runtime-compatibility' }] },
      { type: 'INVALIDATE_CONTEXT', contextKinds: ['contracts', 'evidence'] },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!hasContractDrift(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.9, evidence: [], effects: [] };
      const drift = snapshot.contracts?.drift || [];
      return {
        status: 'violated',
        confidence: 0.86,
        findings: drift.map((entry) => ({
          observed: entry.type,
          reason: entry.message,
          affectedParticipants: ['participant-archie'],
          affectedChangeState: 'evidence-required'
        })),
        evidence: drift.map((entry) => ({ id: entry.contract || entry.message, kind: 'contract-drift', confidence: 0.86 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  contractDriftPolicy
};
