function normalizeDiffEntries(entries = []) {
  return entries
    .map((entry) => ({
      file: String(entry.file || '').trim(),
      added: Number.isFinite(Number(entry.added)) ? Number(entry.added) : 0,
      removed: Number.isFinite(Number(entry.removed)) ? Number(entry.removed) : 0,
      participantId: String(entry.participantId || '').trim()
    }))
    .filter((entry) => entry.file);
}

module.exports = { normalizeDiffEntries };
