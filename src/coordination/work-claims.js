const crypto = require('node:crypto');
const { detectScopeOverlap } = require('./overlap');

class WorkClaimRegistry {
  constructor() {
    this.claims = [];
  }

  declare(input = {}) {
    const claim = {
      id: input.id || `claim_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      changeId: input.changeId || 'unknown-change',
      participantId: input.participantId || 'unknown-participant',
      scope: {
        files: unique(input.scope?.files),
        capabilities: unique(input.scope?.capabilities),
        contracts: unique(input.scope?.contracts),
        runtimes: unique(input.scope?.runtimes)
      },
      intent: String(input.intent || '').trim(),
      mode: normalizeMode(input.mode),
      status: normalizeStatus(input.status || 'active'),
      createdAt: input.createdAt || new Date().toISOString()
    };
    this.claims.push(claim);
    return claim;
  }

  list(changeId = null) {
    if (!changeId) return [...this.claims];
    return this.claims.filter((claim) => claim.changeId === changeId);
  }

  release(claimId) {
    const claim = this.claims.find((entry) => entry.id === claimId);
    if (!claim) return null;
    claim.status = 'released';
    return claim;
  }

  detectConflicts(changeId = null) {
    const candidates = this.list(changeId).filter((claim) => claim.status === 'active');
    const conflicts = [];
    for (let i = 0; i < candidates.length; i += 1) {
      for (let j = i + 1; j < candidates.length; j += 1) {
        const overlap = detectScopeOverlap(candidates[i].scope, candidates[j].scope);
        if (!overlap.hasOverlap) continue;
        conflicts.push({
          type: 'WORK_CONFLICT',
          participants: [candidates[i].participantId, candidates[j].participantId],
          claims: [candidates[i].id, candidates[j].id],
          overlap,
          recommendation: overlap.files.length
            ? 'Assign one participant as implementation owner and route other participant to compatibility review.'
            : 'Coordinate implementation order to avoid overlap.'
        });
      }
    }
    return conflicts;
  }
}

function unique(value = []) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry).trim()).filter(Boolean)));
}

function normalizeMode(value) {
  const allowed = new Set(['investigating', 'planning', 'implementing', 'reviewing', 'verifying']);
  return allowed.has(value) ? value : 'planning';
}

function normalizeStatus(value) {
  const allowed = new Set(['proposed', 'active', 'completed', 'released', 'conflicted']);
  return allowed.has(value) ? value : 'proposed';
}

module.exports = {
  WorkClaimRegistry
};
