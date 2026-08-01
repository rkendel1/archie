const crypto = require('node:crypto');

function createChangePlan(input = {}) {
  const now = new Date().toISOString();
  return {
    id: input.id || `plan_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    intent_id: input.intent_id || null,
    steps: Array.isArray(input.steps) ? input.steps : [],
    files: Array.isArray(input.files) ? input.files : [],
    expected_outcomes: Array.isArray(input.expected_outcomes) ? input.expected_outcomes : [],
    status: 'submitted',
    submitted_at: now,
    updated_at: now
  };
}

module.exports = {
  createChangePlan
};
