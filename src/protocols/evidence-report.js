function createEvidenceReport(input = {}) {
  return {
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    submitted_at: new Date().toISOString()
  };
}

module.exports = {
  createEvidenceReport
};
