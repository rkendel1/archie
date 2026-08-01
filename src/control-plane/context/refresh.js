function refreshParticipantContext(contextSnapshot = {}) {
  return {
    ...contextSnapshot,
    status: 'current',
    invalidated: [],
    acknowledgedAt: new Date().toISOString(),
    refreshedAt: new Date().toISOString()
  };
}

module.exports = {
  refreshParticipantContext
};
