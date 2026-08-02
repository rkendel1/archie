function normalizeWorkClaims(claims = []) {
  return claims
    .map((claim) => ({
      path: String(claim.path || '').trim(),
      participantId: String(claim.participantId || '').trim(),
      mode: String(claim.mode || 'implementing').trim(),
      overlapRisk: String(claim.overlapRisk || 'unknown').trim()
    }))
    .filter((claim) => claim.path && claim.participantId);
}

module.exports = { normalizeWorkClaims };
