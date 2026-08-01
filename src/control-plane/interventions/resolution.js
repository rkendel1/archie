const { canTransitionIntervention } = require('./lifecycle');
const { addInterventionHistory } = require('./history');

function resolveIntervention(intervention, input = {}) {
  if (!intervention || !canTransitionIntervention(intervention.status, 'resolved')) return intervention;
  intervention.status = 'resolved';
  intervention.resolution = String(input.reason || 'Resolved with evidence').trim();
  intervention.resolvedAt = new Date().toISOString();
  intervention.resolvedBy = input.actor || 'system';
  intervention.verifiedBy = input.verifiedBy || 'Archie';
  addInterventionHistory(intervention, 'resolved', {
    reason: intervention.resolution,
    actor: intervention.resolvedBy,
    evidence: input.evidence || []
  });
  return intervention;
}

function waiveIntervention(intervention, input = {}) {
  if (!intervention || !canTransitionIntervention(intervention.status, 'waived')) return intervention;
  intervention.status = 'waived';
  intervention.waivedAt = new Date().toISOString();
  intervention.waivedBy = input.actor || 'system';
  intervention.waiver = {
    reason: String(input.reason || 'Waived by decision').trim(),
    decisionId: input.decisionId || null
  };
  addInterventionHistory(intervention, 'waived', intervention.waiver);
  return intervention;
}

module.exports = {
  resolveIntervention,
  waiveIntervention
};
