const crypto = require('node:crypto');

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return [];
}

function createChangeProposal(input = {}, defaults = {}) {
  const now = new Date().toISOString();
  const sessionId = input.sessionId || input.session_id || defaults.sessionId || null;
  const intentSummary = String(input.intent?.summary || input.intent || input.summary || '').trim();
  const desiredOutcome = String(input.intent?.desiredOutcome || input.desiredOutcome || intentSummary || '').trim();
  return {
    id: input.id || `proposal_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    sessionId,
    actor: {
      type: input.actor?.type || defaults.actorType || 'system',
      id: input.actor?.id || defaults.actorId || 'archie-runtime',
      name: input.actor?.name || defaults.actorName
    },
    intent: {
      summary: intentSummary,
      desiredOutcome,
      rationale: input.intent?.rationale || input.rationale || undefined
    },
    scope: {
      declaredFiles: toArray(input.scope?.declaredFiles || input.files),
      declaredCapabilities: toArray(input.scope?.declaredCapabilities || input.capabilities),
      declaredRuntimes: toArray(input.scope?.declaredRuntimes || input.runtimes),
      declaredContracts: toArray(input.scope?.declaredContracts || input.contracts)
    },
    plan: Array.isArray(input.plan) ? input.plan : [],
    constraints: {
      preserveContracts: input.constraints?.preserveContracts ?? true,
      preserveRuntimeCompatibility: input.constraints?.preserveRuntimeCompatibility ?? true,
      avoidArchitectureChanges: input.constraints?.avoidArchitectureChanges ?? false,
      requiredEvidence: toArray(input.constraints?.requiredEvidence)
    },
    status: input.status || 'reviewing',
    createdAt: input.createdAt || now,
    updatedAt: now
  };
}

module.exports = {
  createChangeProposal
};
