function addInterventionHistory(intervention, event, details = {}) {
  intervention.history = intervention.history || [];
  intervention.history.push({
    event,
    at: new Date().toISOString(),
    ...details
  });
  return intervention;
}

module.exports = {
  addInterventionHistory
};
