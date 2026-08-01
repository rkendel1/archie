function classifyFreshness({ observedAt = null, validForRevision = null, currentRevision = null, maxAgeMs = 30 * 60 * 1000 } = {}) {
  if (!observedAt && !validForRevision) return 'unknown';
  if (validForRevision && currentRevision && validForRevision !== currentRevision) return 'invalidated';
  if (!observedAt) return 'unknown';
  const age = Date.now() - new Date(observedAt).getTime();
  if (!Number.isFinite(age) || age < 0) return 'unknown';
  return age <= maxAgeMs ? 'current' : 'stale';
}

module.exports = {
  classifyFreshness
};
