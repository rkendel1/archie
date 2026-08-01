function normalizeAlternatives(alternatives = []) {
  return (Array.isArray(alternatives) ? alternatives : []).map((entry) => ({
    option: String(entry.option || entry).trim(),
    rationale: String(entry.rationale || '').trim(),
    accepted: Boolean(entry.accepted)
  })).filter((entry) => entry.option);
}

module.exports = {
  normalizeAlternatives
};
