const { createProvenance } = require('./provenance');
const { classifyFreshness } = require('./freshness');
const { clampConfidence } = require('./confidence');

function createClaim(input = {}, runtime = {}) {
  const provenance = createProvenance({
    source: input.source,
    kind: input.kind,
    observedAt: input.observedAt,
    revision: input.validForRevision,
    confidence: input.confidence
  });
  return {
    id: input.id || `${String(input.kind || 'claim')}_${Math.random().toString(36).slice(2, 10)}`,
    statement: String(input.statement || '').trim(),
    kind: provenance.kind,
    status: input.status || 'unverified',
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    confidence: clampConfidence(input.confidence ?? provenance.confidence ?? 0.35),
    source: provenance.source,
    observedAt: provenance.observedAt,
    validForRevision: provenance.validForRevision,
    freshness: classifyFreshness({
      observedAt: provenance.observedAt,
      validForRevision: provenance.validForRevision,
      currentRevision: runtime.currentRevision
    })
  };
}

module.exports = {
  createClaim
};
