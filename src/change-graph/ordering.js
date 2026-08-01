function recommendOrdering({ dependencies = [], conflicts = [] } = {}) {
  const recommendations = [];
  for (const dependency of dependencies) {
    recommendations.push({
      order: [dependency.from, dependency.to],
      reason: dependency.reason
    });
  }
  for (const conflict of conflicts.filter((entry) => entry.severity === 'high')) {
    recommendations.push({
      order: [...conflict.changeIds],
      reason: `Resolve shared contract updates first: ${conflict.sharedContracts.join(', ')}`
    });
  }
  return recommendations;
}

module.exports = {
  recommendOrdering
};
