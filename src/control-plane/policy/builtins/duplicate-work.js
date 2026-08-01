const { hasDuplicateWork } = require('../conditions');

function duplicateWorkPolicy() {
  return {
    id: 'duplicate-capability',
    name: 'Duplicate Capability Policy',
    description: 'Duplicate capability implementation requires explicit architecture decision.',
    domain: 'coordination',
    priority: 'high',
    appliesTo: { change: 'active' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'high' },
      { type: 'REQUIRE_DECISION', decisionType: 'architecture' },
      { type: 'REQUIRE_EVIDENCE', requirements: [{ type: 'architecture', name: 'architecture-decision' }] },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!hasDuplicateWork(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.88, evidence: [], effects: [] };
      const duplicates = snapshot.coordination.duplicates || [];
      return {
        status: 'violated',
        confidence: 0.85,
        findings: duplicates.map((entry) => ({
          observed: 'duplicate-capability',
          reason: entry.message,
          affectedParticipants: entry.participants || [],
          affectedChangeState: 'decision-required'
        })),
        evidence: duplicates.map((entry) => ({ id: entry.capability || 'unknown-capability', kind: 'capability-ownership', confidence: 0.82 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  duplicateWorkPolicy
};
