function escalationForRisk(risk = {}) {
  if (risk.level === 'CRITICAL') return 'Human approval required';
  if (risk.level === 'HIGH') return 'Human decision required';
  if (risk.level === 'MEDIUM') return 'Human review recommended';
  return 'Normal verification';
}

module.exports = {
  escalationForRisk
};
