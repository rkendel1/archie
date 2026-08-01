function requiresHumanApproval(risk = {}) {
  return risk.level === 'CRITICAL' || risk.level === 'HIGH';
}

module.exports = {
  requiresHumanApproval
};
