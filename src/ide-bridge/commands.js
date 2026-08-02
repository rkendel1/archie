function normalizeCommandEvents(entries = []) {
  return entries
    .map((entry) => ({
      command: String(entry.command || '').trim(),
      intent: String(entry.intent || 'custom').trim(),
      participantId: String(entry.participantId || '').trim(),
      workingDirectory: String(entry.workingDirectory || '').trim(),
      exitCode: Number.isFinite(Number(entry.exitCode)) ? Number(entry.exitCode) : null
    }))
    .filter((entry) => entry.command && entry.participantId);
}

module.exports = { normalizeCommandEvents };
