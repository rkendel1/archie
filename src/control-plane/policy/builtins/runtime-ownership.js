const { hasRuntimeOwnershipIssue } = require('../conditions');

function runtimeOwnershipPolicy() {
  return {
    id: 'runtime-ownership',
    name: 'Runtime Ownership Policy',
    description: 'Capabilities must have explicit runtime ownership or accepted architecture decision.',
    domain: 'runtime',
    priority: 'critical',
    appliesTo: { capabilities: 'all' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'high' },
      { type: 'REQUIRE_DECISION', decisionType: 'runtime-ownership' },
      { type: 'REQUIRE_EVIDENCE', requirements: [{ type: 'runtime', name: 'runtime-ownership-proof' }] },
      { type: 'ESCALATE_REVIEW', reviewLevel: 'human-decision' }
    ],
    evaluate(snapshot = {}) {
      if (!hasRuntimeOwnershipIssue(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.89, evidence: [], effects: [] };
      const drifts = snapshot.architectureConformance?.drifts || [];
      return {
        status: 'violated',
        confidence: 0.87,
        findings: drifts.map((entry) => ({
          observed: entry.type,
          reason: entry.message,
          affectedParticipants: ['participant-archie'],
          affectedChangeState: 'review-required'
        })),
        evidence: drifts.map((entry, index) => ({ id: `runtime-drift-${index}`, kind: 'topology-conformance', confidence: 0.87 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  runtimeOwnershipPolicy
};
