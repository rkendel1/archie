function buildContextInvalidations({ activeChangeSession = {}, modelVersion = null, previousRevision = null, affectedContracts = [], affectedRuntimes = [] }) {
  const participants = participantsFromSession(activeChangeSession);
  const invalidations = [];

  if (modelVersion && previousRevision && String(modelVersion) !== String(previousRevision)) {
    for (const participant of participants) {
      if (affectedRuntimes.length) {
        invalidations.push({
          participantId: participant.id,
          kind: 'runtime-topology',
          reason: 'Runtime topology changed after participant context was delivered.',
          previousRevision: String(previousRevision),
          currentRevision: String(modelVersion)
        });
      }
      if (affectedContracts.length) {
        invalidations.push({
          participantId: participant.id,
          kind: 'contract-consumer-inventory',
          reason: 'Contract consumer inventory changed after context delivery.',
          previousRevision: String(previousRevision),
          currentRevision: String(modelVersion)
        });
      }
    }
  }

  return invalidations;
}

function participantsFromSession(session = {}) {
  if (!session) return [{ id: 'participant-archie' }];
  const roomParticipants = session.change_room?.participants || [];
  if (roomParticipants.length) return roomParticipants;
  return [{ id: 'participant-archie' }];
}

module.exports = {
  buildContextInvalidations
};
