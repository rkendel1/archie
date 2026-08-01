const REEVALUATE_ON = new Set([
  'repository.change.detected',
  'analysis.completed',
  'change-session.updated',
  'change.proposed',
  'coordination.work-claim.declared',
  'decision.recorded',
  'agent.intent.declared',
  'agent.plan.reviewed',
  'agent.change.observed',
  'agent.evidence.required',
  'agent.verification.completed',
  'agent.completion.reviewed'
]);

function shouldReevaluateControlPlane(eventType = '') {
  return REEVALUATE_ON.has(eventType);
}

module.exports = {
  shouldReevaluateControlPlane
};
