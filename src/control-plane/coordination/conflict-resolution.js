function resolveCoordinationAction(action = {}, input = {}) {
  return {
    ...action,
    status: 'resolved',
    selectedOption: input.selectedOption || action.selectedOption || null,
    resolution: String(input.reason || 'Resolved by participants').trim(),
    resolvedAt: new Date().toISOString()
  };
}

module.exports = {
  resolveCoordinationAction
};
