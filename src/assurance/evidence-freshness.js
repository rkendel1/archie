function evaluateEvidenceFreshness(evidence = []) {
  const stale = (evidence || []).filter((entry) => entry.status === 'stale');
  const missing = (evidence || []).filter((entry) => entry.status === 'missing');
  if (!evidence.length) return { status: 'UNKNOWN', details: ['No evidence records found'] };
  if (missing.length) return { status: 'WARNING', details: ['Missing required evidence'] };
  if (stale.length) return { status: 'WARNING', details: ['Evidence has gone stale after changes'] };
  return { status: 'PASS', details: ['Evidence freshness is current'] };
}

module.exports = {
  evaluateEvidenceFreshness
};
