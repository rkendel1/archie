const { overlappingWorkPolicy } = require('./builtins/work-conflict');
const { duplicateWorkPolicy } = require('./builtins/duplicate-work');
const { staleContextPolicy } = require('./builtins/stale-context');
const { runtimeOwnershipPolicy } = require('./builtins/runtime-ownership');
const { contractDriftPolicy } = require('./builtins/contract-drift');
const { missingEvidencePolicy } = require('./builtins/missing-evidence');
const { unresolvedRiskPolicy } = require('./builtins/unresolved-risk');
const { decisionRequiredPolicy } = require('./builtins/decision-required');
const { dependencyOrderPolicy } = require('./builtins/dependency-order');
const { completionReadinessPolicy } = require('./builtins/completion-readiness');

function builtinPolicies() {
  return [
    overlappingWorkPolicy(),
    duplicateWorkPolicy(),
    staleContextPolicy(),
    runtimeOwnershipPolicy(),
    contractDriftPolicy(),
    missingEvidencePolicy(),
    unresolvedRiskPolicy(),
    decisionRequiredPolicy(),
    dependencyOrderPolicy(),
    completionReadinessPolicy()
  ];
}

module.exports = {
  builtinPolicies
};
