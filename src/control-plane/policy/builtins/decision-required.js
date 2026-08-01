const { hasUnresolvedRisk } = require('../conditions');

function decisionRequiredPolicy() {
  return {
    id: 'decision-continuity',
    name: 'Decision Continuity Policy',
    description: 'Implementation may not contradict accepted decision without superseding decision.',
    domain: 'decision',
    priority: 'high',
    appliesTo: { decisions: 'accepted' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'high' },
      { type: 'REQUIRE_DECISION', decisionType: 'supersession' },
      { type: 'REQUIRE_ACKNOWLEDGEMENT' },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      const decisions = snapshot.decisions || [];
      const active = decisions.filter((entry) => entry.status === 'accepted');
      if (!active.length || !hasUnresolvedRisk(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.82, evidence: [], effects: [] };
      return {
        status: 'uncertain',
        confidence: 0.66,
        findings: active.map((entry) => ({
          observed: 'accepted-decision-needs-continuity-check',
          reason: `Accepted decision ${entry.id} must be acknowledged/superseded if contradicted`,
          affectedParticipants: entry.participants || [],
          affectedChangeState: 'decision-required'
        })),
        evidence: active.map((entry) => ({ id: entry.id, kind: 'decision', confidence: 0.66 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  decisionRequiredPolicy
};
