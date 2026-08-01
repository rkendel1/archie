const KNOWLEDGE_CLASS = Object.freeze({
  OBSERVED: 'observed',
  DECLARED: 'declared',
  INFERRED: 'inferred',
  PARTICIPANT_CLAIM: 'participant-claim',
  VERIFIED: 'verified',
  DECISION: 'decision',
  UNCERTAIN: 'uncertain'
});

function isKnowledgeClass(value) {
  return Object.values(KNOWLEDGE_CLASS).includes(value);
}

function normalizeKnowledgeClass(value, fallback = KNOWLEDGE_CLASS.UNCERTAIN) {
  return isKnowledgeClass(value) ? value : fallback;
}

module.exports = {
  KNOWLEDGE_CLASS,
  isKnowledgeClass,
  normalizeKnowledgeClass
};
