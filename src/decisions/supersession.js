function supersedeDecision(registry, targetDecisionId, replacementDecisionId) {
  const target = registry.updateStatus(targetDecisionId, 'superseded');
  const replacement = registry.updateStatus(replacementDecisionId, 'accepted');
  return { target, replacement };
}

module.exports = {
  supersedeDecision
};
