const { classifyConflict } = require('../coordination/conflict');
const { recommendOwnership } = require('../coordination/ownership');
const { detectDuplicateWork } = require('../coordination/duplicate-work');
const { buildSchedulingRecommendations } = require('../coordination/scheduling');

function evaluateCoordination(state, topology, changeId = null) {
  const claims = state.workClaims.list(changeId);
  const conflicts = state.workClaims.detectConflicts(changeId).map((entry) => classifyConflict(entry));
  const ownership = conflicts
    .map((entry) => recommendOwnership(entry, claims))
    .filter(Boolean);
  const duplicates = detectDuplicateWork({ claims, capabilityOwnership: topology.capabilityOwnership || [] });
  const scheduling = buildSchedulingRecommendations({ conflicts, duplicates });
  return {
    claims,
    conflicts,
    duplicates,
    ownership,
    scheduling
  };
}

module.exports = {
  evaluateCoordination
};
