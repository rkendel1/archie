function buildParticipantContextSnapshots(session = {}, base = {}) {
  const participants = session.change_room?.participants || [];
  const existingByParticipant = new Map((base.existingContexts || []).map((entry) => [entry.participantId, entry]));
  return participants.map((participant) => ({
    ...(existingByParticipant.get(participant.id) || {}),
    participantId: participant.id,
    changeId: session.id,
    contextRevision: String(base.modelVersion || 0),
    status: (base.invalidations || []).some((item) => item.participantId === participant.id)
      ? 'refresh-required'
      : (existingByParticipant.get(participant.id)?.status || 'current'),
    invalidated: (base.invalidations || []).filter((item) => item.participantId === participant.id),
    requiredBefore: ['implementation-submission', 'evidence-submission', 'completion'],
    updatedAt: new Date().toISOString()
  }));
}

module.exports = {
  buildParticipantContextSnapshots
};
