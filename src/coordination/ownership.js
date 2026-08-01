function recommendOwnership(conflict = {}, claims = []) {
  const [leftId, rightId] = conflict.claims || [];
  const left = claims.find((claim) => claim.id === leftId);
  const right = claims.find((claim) => claim.id === rightId);
  if (!left || !right) return null;
  const leftScope = score(left.scope);
  const rightScope = score(right.scope);
  const owner = leftScope >= rightScope ? left : right;
  const reviewer = owner.id === left.id ? right : left;
  return {
    ownerClaimId: owner.id,
    ownerParticipantId: owner.participantId,
    reviewerClaimId: reviewer.id,
    reviewerParticipantId: reviewer.participantId,
    reason: 'Select owner with broader overlap context to minimize duplicate implementation risk.'
  };
}

function score(scope = {}) {
  return (scope.files || []).length * 3 + (scope.contracts || []).length * 2 + (scope.capabilities || []).length;
}

module.exports = {
  recommendOwnership
};
