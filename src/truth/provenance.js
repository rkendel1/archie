const { normalizeKnowledgeClass } = require('./knowledge');

function createProvenance({ source = {}, kind = 'observed', observedAt = null, revision = null, confidence = null } = {}) {
  return {
    source: {
      type: source.type || 'repository',
      id: source.id || null,
      description: source.description || null
    },
    kind: normalizeKnowledgeClass(kind),
    observedAt: observedAt || new Date().toISOString(),
    validForRevision: revision || null,
    confidence: Number.isFinite(confidence) ? Number(confidence) : null
  };
}

module.exports = {
  createProvenance
};
