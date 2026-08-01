const { hasWorkConflicts } = require('../conditions');

function overlappingWorkPolicy() {
  return {
    id: 'overlapping-work',
    name: 'Overlapping Work Policy',
    description: 'No unresolved implementation overlap may proceed without explicit coordination.',
    domain: 'coordination',
    priority: 'critical',
    appliesTo: { change: 'active' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'high' },
      { type: 'REQUIRE_COORDINATION' },
      { type: 'PUBLISH_PARTICIPANT_UPDATE' },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!hasWorkConflicts(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.93, evidence: [], effects: [] };
      const conflicts = snapshot.coordination.conflicts || [];
      return {
        status: 'violated',
        confidence: 0.9,
        findings: conflicts.map((conflict) => ({
          observed: 'overlapping-work-claim',
          reason: conflict.recommendation,
          affectedParticipants: conflict.participants,
          affectedChangeState: 'coordination-required'
        })),
        evidence: conflicts.map((entry) => ({ id: entry.claims.join(':'), kind: 'work-claims', confidence: 0.9 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  overlappingWorkPolicy
};
