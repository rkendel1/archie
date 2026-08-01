function summarizeQueue(items = []) {
  const summary = {
    requiresDecision: 0,
    highRisk: 0,
    readyForCompletion: 0,
    lowRisk: 0
  };
  for (const item of items) {
    if (item.requiresHumanApproval) summary.requiresDecision += 1;
    if (item.risk.level === 'HIGH' || item.risk.level === 'CRITICAL') summary.highRisk += 1;
    if (item.risk.level === 'LOW') summary.lowRisk += 1;
    if (!item.requiresHumanApproval && item.matrixHealthy) summary.readyForCompletion += 1;
  }
  return summary;
}

module.exports = {
  summarizeQueue
};
