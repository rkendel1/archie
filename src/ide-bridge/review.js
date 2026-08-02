function normalizeReviewEntries(entries = []) {
  return entries
    .map((entry) => ({
      changeSessionId: String(entry.changeSessionId || '').trim(),
      risk: String(entry.risk || 'LOW').trim(),
      requiresDecision: Boolean(entry.requiresDecision)
    }))
    .filter((entry) => entry.changeSessionId);
}

module.exports = { normalizeReviewEntries };
