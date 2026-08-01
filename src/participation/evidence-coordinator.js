const { createEvidenceReport } = require('../protocols/evidence-report');

function classifyEvidence(reportInput = {}, requiredEvidence = []) {
  const report = createEvidenceReport(reportInput);
  const claimed = report.evidence.map((entry) => entry.type || entry.target).filter(Boolean);
  const missing = requiredEvidence.filter((requirement) => !claimed.some((item) => item.includes(requirement) || requirement.includes(item)));
  return {
    ...report,
    classification: {
      declared: report.evidence.length,
      verified: report.evidence.filter((entry) => entry.result === 'passed').length,
      failed: report.evidence.filter((entry) => entry.result === 'failed').length,
      missing
    }
  };
}

module.exports = {
  classifyEvidence
};
