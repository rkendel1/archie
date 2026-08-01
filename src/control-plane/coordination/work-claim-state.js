function summarizeWorkClaims(claims = []) {
  const byParticipant = {};
  for (const claim of claims) {
    byParticipant[claim.participantId] = byParticipant[claim.participantId] || {
      participantId: claim.participantId,
      mode: claim.mode,
      files: new Set(),
      contracts: new Set(),
      capabilities: new Set()
    };
    for (const file of claim.scope?.files || []) byParticipant[claim.participantId].files.add(file);
    for (const contract of claim.scope?.contracts || []) byParticipant[claim.participantId].contracts.add(contract);
    for (const capability of claim.scope?.capabilities || []) byParticipant[claim.participantId].capabilities.add(capability);
  }

  return Object.values(byParticipant).map((entry) => ({
    participantId: entry.participantId,
    mode: entry.mode,
    files: entry.files.size,
    contracts: entry.contracts.size,
    capabilities: entry.capabilities.size
  }));
}

module.exports = {
  summarizeWorkClaims
};
