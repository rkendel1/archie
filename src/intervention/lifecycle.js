const crypto = require('node:crypto');
const { suggestEvidence } = require('./evidence');

function hydrate(findings = [], context = {}) {
  const sessionId = context.changeSession?.id || context.proposal?.sessionId || null;
  return findings.map((finding) => ({
    id: `intervention_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    changeSessionId: sessionId,
    type: finding.type,
    severity: finding.severity || 'medium',
    status: 'open',
    message: finding.message,
    reasoning: finding.reasoning || [],
    affectedCapabilities: context.affectedCapabilities || [],
    requiredActions: finding.requiredActions || [],
    suggestedEvidence: finding.suggestedEvidence || suggestEvidence(finding.type),
    confidence: Number(finding.confidence || 0.7)
  }));
}

module.exports = {
  hydrate
};
