const WEIGHTS = { high: 3, medium: 2, low: 1 };

function prioritize(findings = []) {
  return [...findings].sort((a, b) => {
    const severityDiff = (WEIGHTS[b.severity] || 0) - (WEIGHTS[a.severity] || 0);
    if (severityDiff) return severityDiff;
    return Number(b.confidence || 0) - Number(a.confidence || 0);
  });
}

module.exports = {
  prioritize
};
