const { isCompletionReady } = require('../conditions');

function completionReadinessPolicy() {
  return {
    id: 'completion-readiness',
    name: 'Completion Readiness Policy',
    description: 'Completion is blocked until requirements/interventions/evidence/decisions are resolved.',
    domain: 'completion',
    priority: 'critical',
    appliesTo: { change: 'active' },
    effects: [
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (isCompletionReady(snapshot)) {
        return {
          status: 'satisfied',
          confidence: 0.94,
          findings: [{ observed: 'completion-ready', reason: 'No active blockers', affectedParticipants: [], affectedChangeState: 'completion-ready' }],
          evidence: [],
          effects: []
        };
      }
      return {
        status: 'violated',
        confidence: 0.9,
        findings: [{ observed: 'completion-blocked', reason: 'One or more active policy requirements remain open.', affectedParticipants: [], affectedChangeState: 'completion-blocked' }],
        evidence: [],
        effects: this.effects
      };
    }
  };
}

module.exports = {
  completionReadinessPolicy
};
