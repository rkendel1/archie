const { hasUnresolvedRisk } = require('../conditions');

function unresolvedRiskPolicy() {
  return {
    id: 'high-risk-review',
    name: 'High-Risk Review Policy',
    description: 'High-risk engineering changes require explicit human decision before completion.',
    domain: 'decision',
    priority: 'high',
    appliesTo: { review: 'active' },
    effects: [
      { type: 'REQUIRE_DECISION', decisionType: 'human-review' },
      { type: 'ESCALATE_REVIEW', reviewLevel: 'high-risk' },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!hasUnresolvedRisk(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.91, evidence: [], effects: [] };
      const items = (snapshot.reviewQueue?.items || []).filter((entry) => entry.requiresHumanApproval);
      return {
        status: 'violated',
        confidence: 0.89,
        findings: items.map((entry) => ({
          observed: 'human-decision-required',
          reason: entry.risk?.reason,
          affectedParticipants: ['participant-engineering-owner'],
          affectedChangeState: 'decision-required'
        })),
        evidence: items.map((entry) => ({ id: entry.changeId, kind: 'review-risk', confidence: 0.88 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  unresolvedRiskPolicy
};
