function createChangeIntent(input = {}) {
  const outcome = String(input.outcome || input.intent?.outcome || input.description || '').trim();
  return {
    id: input.id || null,
    outcome: outcome || null,
    scope: input.scope || { capabilities: [], areas: [] },
    constraints: Array.isArray(input.constraints) ? input.constraints : [],
    success_criteria: Array.isArray(input.success_criteria) ? input.success_criteria : [],
    status: outcome ? 'declared' : 'draft',
    confidence: outcome ? 1 : 0
  };
}

module.exports = {
  createChangeIntent
};
