function acknowledgeContext(snapshot = {}, actor = 'participant') {
  return {
    ...snapshot,
    acknowledgedBy: actor,
    acknowledgedAt: new Date().toISOString()
  };
}

module.exports = {
  acknowledgeContext
};
