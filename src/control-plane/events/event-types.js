const CONTROL_PLANE_EVENTS = {
  POLICY_EVALUATED: 'control-plane.policy.evaluated',
  POLICY_VIOLATED: 'control-plane.policy.violated',
  REQUIREMENT_CREATED: 'control-plane.requirement.created',
  REQUIREMENT_UPDATED: 'control-plane.requirement.updated',
  INTERVENTION_CREATED: 'control-plane.intervention.created',
  INTERVENTION_ACKNOWLEDGED: 'control-plane.intervention.acknowledged',
  INTERVENTION_RESOLVED: 'control-plane.intervention.resolved',
  INTERVENTION_WAIVED: 'control-plane.intervention.waived',
  INTERVENTION_ESCALATED: 'control-plane.intervention.escalated',
  CONTEXT_INVALIDATED: 'control-plane.context.invalidated',
  CONTEXT_REFRESH_REQUIRED: 'control-plane.context.refresh.required',
  CONTEXT_REFRESHED: 'control-plane.context.refreshed',
  COORDINATION_REQUIRED: 'control-plane.coordination.required',
  COORDINATION_RESOLVED: 'control-plane.coordination.resolved',
  REVIEW_REQUIRED: 'control-plane.review.required',
  TRANSITION_EVALUATED: 'control-plane.transition.evaluated',
  COMPLETION_EVALUATED: 'control-plane.completion.evaluated'
};

module.exports = {
  CONTROL_PLANE_EVENTS
};
