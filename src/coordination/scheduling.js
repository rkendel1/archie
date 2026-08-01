function buildSchedulingRecommendations({ conflicts = [], duplicates = [] } = {}) {
  const actions = [];
  for (const conflict of conflicts) {
    actions.push({
      type: 'sequence',
      priority: conflict.severity === 'high' ? 'high' : 'medium',
      message: `Resolve overlap for ${conflict.claims.join(' vs ')} before concurrent implementation.`
    });
  }
  for (const duplicate of duplicates) {
    actions.push({
      type: 'merge-or-split',
      priority: duplicate.ownershipConflicts.length ? 'high' : 'medium',
      message: `Compare intent for ${duplicate.claims.join(' and ')} to avoid duplicate capability implementation.`
    });
  }
  return actions;
}

module.exports = {
  buildSchedulingRecommendations
};
