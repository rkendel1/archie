const { canTransitionIntervention } = require('./lifecycle');
const { addInterventionHistory } = require('./history');

function acknowledgeIntervention(intervention, actor = 'system') {
  if (!intervention || !canTransitionIntervention(intervention.status, 'acknowledged')) return intervention;
  intervention.status = 'acknowledged';
  addInterventionHistory(intervention, 'acknowledged', { actor });
  return intervention;
}

module.exports = {
  acknowledgeIntervention
};
