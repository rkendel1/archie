const { buildContextInvalidations } = require('./invalidation');
const { buildParticipantContextSnapshots } = require('./snapshots');
const { buildContextUpdates } = require('./delivery');

function computeContextState(input = {}) {
  const invalidations = buildContextInvalidations(input);
  const snapshots = buildParticipantContextSnapshots(input.activeChangeSession || {}, {
    modelVersion: input.modelVersion,
    invalidations,
    existingContexts: input.existingContexts || []
  });
  const updates = buildContextUpdates({ snapshots, activeChangeSession: input.activeChangeSession || {} });

  return {
    invalidations,
    participantSnapshots: snapshots,
    participantUpdates: updates,
    summary: {
      participants: snapshots.length,
      refreshRequired: snapshots.filter((entry) => entry.status === 'refresh-required').length
    }
  };
}

module.exports = {
  computeContextState
};
