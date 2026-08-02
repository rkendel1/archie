function normalizeEvidenceEntries(entries = []) {
  return entries
    .map((entry) => ({
      type: String(entry.type || '').trim(),
      name: String(entry.name || '').trim(),
      status: String(entry.status || 'missing').trim(),
      participantId: String(entry.participantId || '').trim()
    }))
    .filter((entry) => entry.type && entry.name);
}

module.exports = { normalizeEvidenceEntries };
