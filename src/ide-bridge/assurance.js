function normalizeAssuranceEntries(entries = []) {
  return entries
    .map((entry) => ({
      requirement: String(entry.requirement || '').trim(),
      status: String(entry.status || 'pending').trim(),
      score: Number.isFinite(Number(entry.score)) ? Number(entry.score) : null
    }))
    .filter((entry) => entry.requirement && entry.status);
}

module.exports = { normalizeAssuranceEntries };
