function detectDuplicateWork({ claims = [], capabilityOwnership = [] } = {}) {
  const duplicates = [];
  for (let i = 0; i < claims.length; i += 1) {
    for (let j = i + 1; j < claims.length; j += 1) {
      const left = claims[i];
      const right = claims[j];
      const sameIntent = normalize(left.intent) && normalize(left.intent) === normalize(right.intent);
      const sharedCapabilities = intersect(left.scope?.capabilities || [], right.scope?.capabilities || []);
      if (!sameIntent && !sharedCapabilities.length) continue;
      const ownershipConflicts = sharedCapabilities
        .map((capability) => {
          const owner = capabilityOwnership.find((entry) => entry.capability === capability);
          return owner ? { capability, canonicalRuntime: owner.runtime } : null;
        })
        .filter(Boolean);
      duplicates.push({
        type: 'POTENTIAL_DUPLICATE_WORK',
        claims: [left.id, right.id],
        participants: [left.participantId, right.participantId],
        sharedCapabilities,
        ownershipConflicts,
        recommendation: ownershipConflicts.length
          ? 'Review whether secondary implementation should be an adapter instead of a second execution engine.'
          : 'Merge implementation plans or split by explicit boundaries.'
      });
    }
  }
  return duplicates;
}

function normalize(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function intersect(a = [], b = []) {
  const left = new Set(a.map((entry) => String(entry).toLowerCase()));
  return b.filter((entry) => left.has(String(entry).toLowerCase()));
}

module.exports = {
  detectDuplicateWork
};
