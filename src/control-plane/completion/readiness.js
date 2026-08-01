function readinessStatus(summary = {}, blockers = []) {
  if (blockers.length) return 'blocked';
  const values = Object.values(summary);
  if (values.some((value) => value === 'incomplete')) return 'not-ready';
  if (values.some((value) => value === 'warning')) return 'uncertain';
  return 'ready';
}

module.exports = {
  readinessStatus
};
