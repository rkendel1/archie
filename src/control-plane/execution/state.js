const { buildExecutionPermissions } = require('./permissions');
const { deriveExecutionStatus } = require('./readiness');

function buildActiveEngineeringState({
  changeId = null,
  requirements = [],
  interventions = [],
  contextState = {},
  coordinationState = {},
  assuranceState = {},
  reviewState = {},
  completionReadiness = {}
}) {
  const permissions = buildExecutionPermissions({ requirements, interventions });
  const status = completionReadiness.status === 'ready'
    ? 'completion-ready'
    : deriveExecutionStatus({ requirements, interventions, reviewState });

  return {
    changeId,
    status,
    activeRequirements: requirements,
    activeInterventions: interventions,
    contextState,
    coordinationState,
    assuranceState,
    reviewState,
    completionReadiness,
    transitions: permissions
  };
}

module.exports = {
  buildActiveEngineeringState
};
