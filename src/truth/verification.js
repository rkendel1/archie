const { clampConfidence, confidenceFromEvidence } = require('./confidence');

function verifyClaims(claims = []) {
  const normalized = Array.isArray(claims) ? claims : [];
  return normalized.map((claim) => {
    const evidenceConfidence = confidenceFromEvidence(claim.evidence || []);
    const score = clampConfidence((claim.confidence + evidenceConfidence) / 2);
    const verified = score >= 0.7 && (claim.evidence || []).length > 0;
    return {
      ...claim,
      status: verified ? 'verified' : claim.status,
      verification: {
        score,
        verified,
        basis: (claim.evidence || []).map((item) => item.id || item.type || 'evidence')
      }
    };
  });
}

module.exports = {
  verifyClaims
};
