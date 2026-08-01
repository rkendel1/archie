const { needsDependencyOrdering } = require('../conditions');

function dependencyOrderPolicy() {
  return {
    id: 'dependency-order',
    name: 'Change Dependency Policy',
    description: 'Dependent change may not complete against outdated dependency state.',
    domain: 'dependency',
    priority: 'medium',
    appliesTo: { changes: 'dependent' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'medium' },
      { type: 'REQUIRE_COORDINATION' },
      { type: 'REQUIRE_CONTEXT_REFRESH' },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!needsDependencyOrdering(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.88, evidence: [], effects: [] };
      const conflicts = snapshot.dependencyGraph?.conflicts || [];
      return {
        status: 'violated',
        confidence: 0.84,
        findings: conflicts.map((entry) => ({
          observed: 'change-ordering-required',
          reason: `Shared files/contracts require ordering: ${(entry.sharedContracts || []).join(', ') || (entry.sharedFiles || []).join(', ')}`,
          affectedParticipants: [],
          affectedChangeState: 'coordination-required'
        })),
        evidence: conflicts.map((entry, index) => ({ id: `dep-conflict-${index}`, kind: 'dependency', confidence: 0.84 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  dependencyOrderPolicy
};
