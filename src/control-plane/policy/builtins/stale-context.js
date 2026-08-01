const { hasStaleContext } = require('../conditions');

function staleContextPolicy() {
  return {
    id: 'stale-context',
    name: 'Stale Context Policy',
    description: 'Invalidated context must be acknowledged or refreshed before evidence/completion.',
    domain: 'context',
    priority: 'high',
    appliesTo: { participants: 'all-active' },
    effects: [
      { type: 'INVALIDATE_CONTEXT', contextKinds: ['runtime-topology', 'contracts', 'decisions', 'evidence'] },
      { type: 'REQUIRE_CONTEXT_REFRESH' },
      { type: 'PUBLISH_PARTICIPANT_UPDATE' },
      { type: 'REQUIRE_ACKNOWLEDGEMENT' }
    ],
    evaluate(snapshot = {}) {
      if (!hasStaleContext(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.9, evidence: [], effects: [] };
      const invalidations = snapshot.context.invalidations || [];
      return {
        status: 'violated',
        confidence: 0.88,
        findings: invalidations.map((entry) => ({
          observed: 'context-invalidated',
          reason: entry.reason,
          affectedParticipants: [entry.participantId],
          affectedChangeState: 'context-refresh-required'
        })),
        evidence: invalidations.map((entry) => ({ id: entry.kind, kind: 'context', confidence: 0.85 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  staleContextPolicy
};
