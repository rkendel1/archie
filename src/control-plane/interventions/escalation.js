const { canTransitionIntervention } = require('./lifecycle');
const { addInterventionHistory } = require('./history');

function escalateIntervention(intervention, input = {}) {
  if (!intervention || !canTransitionIntervention(intervention.status, 'escalated')) return intervention;
  intervention.status = 'escalated';
  intervention.escalatedAt = new Date().toISOString();
  intervention.escalatedTo = input.target || 'engineering-owner';
  intervention.escalationReason = String(input.reason || 'Policy escalation').trim();
  addInterventionHistory(intervention, 'escalated', {
    target: intervention.escalatedTo,
    reason: intervention.escalationReason
  });
  return intervention;
}

module.exports = {
  escalateIntervention
};
