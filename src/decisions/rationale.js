function summarizeRationale(decision = {}) {
  if (decision.rationale) return decision.rationale;
  const evidence = Array.isArray(decision.evidence) ? decision.evidence : [];
  if (!evidence.length) return 'No explicit rationale provided.';
  return `Supported by ${evidence.length} evidence item${evidence.length === 1 ? '' : 's'}.`;
}

module.exports = {
  summarizeRationale
};
