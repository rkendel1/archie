function normalizeParticipant(participant = {}) {
  return {
    participantId: String(participant.participantId || '').trim(),
    name: String(participant.name || '').trim(),
    role: String(participant.role || 'implementation-contributor').trim(),
    status: String(participant.status || 'active').trim()
  };
}

function dedupeParticipants(participants = []) {
  const output = [];
  const seen = new Set();
  for (const participant of participants) {
    const normalized = normalizeParticipant(participant);
    if (!normalized.participantId || seen.has(normalized.participantId)) continue;
    seen.add(normalized.participantId);
    output.push(normalized);
  }
  return output;
}

module.exports = {
  normalizeParticipant,
  dedupeParticipants
};
