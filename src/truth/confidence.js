function clampConfidence(value, fallback = 0.5) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  if (normalized > 1) return Math.max(0, Math.min(1, normalized / 100));
  return Math.max(0, Math.min(1, normalized));
}

function confidenceFromEvidence(evidence = []) {
  if (!Array.isArray(evidence) || !evidence.length) return 0.35;
  const base = evidence.reduce((score, item) => {
    const status = String(item.status || '').toLowerCase();
    if (status === 'verified' || status === 'passed' || status === 'valid') return score + 1;
    if (status === 'stale' || status === 'running') return score + 0.4;
    if (status === 'failed' || status === 'missing') return score - 0.8;
    return score + 0.2;
  }, 0);
  return clampConfidence((base / evidence.length + 1) / 2, 0.35);
}

module.exports = {
  clampConfidence,
  confidenceFromEvidence
};
