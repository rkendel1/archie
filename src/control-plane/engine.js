const { buildRuntimeTopology } = require('../topology/runtime-topology');
const { assessTopologyConformance } = require('../topology/conformance');
const { buildContractRegistry } = require('../contracts/registry');
const { buildChangeDependencyGraph } = require('../change-graph/graph');
const { buildAssuranceMatrix } = require('../assurance/matrix');
const { createClaim } = require('../truth/claims');
const { verifyClaims } = require('../truth/verification');
const { evaluateCoordination } = require('./coordination');
const { evaluateReviewQueue } = require('./review-queue');
const { evaluateEngineeringPolicies } = require('./policy/engine');
const { buildInterventions } = require('./interventions/service');
const { buildRequirements } = require('./execution/requirements');
const { computeContextState } = require('./context/service');
const { buildCoordinationActions } = require('./coordination/actions');
const { evaluateCompletionReadiness } = require('./completion/evaluator');
const { buildActiveEngineeringState } = require('./execution/state');

function runControlPlane({
  model,
  activeChangeSession,
  changeSessions,
  assurance,
  evidence,
  verification,
  architectureIntent,
  state,
  repositoryRevision,
  previousRevision
}) {
  const topology = buildRuntimeTopology(model || {});
  const contractRegistry = buildContractRegistry(model || {});
  const proposedOwnership = inferProposedOwnership(activeChangeSession, model);
  const conformance = assessTopologyConformance(architectureIntent || {}, topology, { proposedOwnership });
  const activeChangeId = activeChangeSession?.id || null;
  const coordination = evaluateCoordination(state, topology, activeChangeId);

  const claims = verifyClaims([
    createClaim({
      statement: 'Runtime topology reflects repository structure',
      kind: 'inferred',
      confidence: topology.topologyConfidence,
      evidence: [{ id: 'runtime-topology', status: 'observed' }],
      validForRevision: repositoryRevision
    }, { currentRevision: repositoryRevision }),
    createClaim({
      statement: 'Canonical contracts are compatible across representations',
      kind: 'inferred',
      confidence: contractRegistry.confidence,
      evidence: contractRegistry.drift.length ? [{ id: 'contract-drift', status: 'failed' }] : [{ id: 'contract-drift', status: 'verified' }],
      validForRevision: repositoryRevision
    }, { currentRevision: repositoryRevision })
  ]);

  const changes = Array.isArray(changeSessions) ? changeSessions : [];
  const assuranceByChange = {};
  const driftByChange = {};
  const conflictsByChange = {};
  for (const change of changes) {
    assuranceByChange[change.id] = buildAssuranceMatrix({
      changeId: change.id,
      topology,
      contractRegistry,
      topologyConformance: conformance,
      conflicts: coordination.conflicts,
      evidence,
      assurance,
      verification
    });
    driftByChange[change.id] = conformance.drifts;
    conflictsByChange[change.id] = coordination.conflicts;
  }

  const dependencyGraph = buildChangeDependencyGraph(changes);
  const reviewQueue = evaluateReviewQueue({
    changes,
    assuranceByChange,
    driftByChange,
    conflictsByChange
  });

  const context = computeContextState({
    activeChangeSession,
    modelVersion: repositoryRevision,
    previousRevision,
    existingContexts: state.participantContexts,
    affectedContracts: contractRegistry.drift.map((entry) => entry.contract).filter(Boolean),
    affectedRuntimes: conformance.drifts.filter((entry) => String(entry.type || '').includes('RUNTIME'))
  });

  const policyInput = {
    generatedAt: new Date().toISOString(),
    topology,
    contracts: contractRegistry,
    architectureConformance: conformance,
    coordination,
    claims,
    decisions: state.decisions.list(),
    dependencyGraph,
    assurance: {
      matrixByChange: assuranceByChange,
      evidenceFreshness: buildEvidenceFreshness(evidence)
    },
    reviewQueue,
    context,
    evidenceState: evidence
  };

  const policy = evaluateEngineeringPolicies(policyInput);
  const interventions = buildInterventions({
    evaluations: policy.evaluations,
    activeChangeId,
    existing: state.interventions
  });
  const requirements = buildRequirements({
    changeId: activeChangeId,
    evaluations: policy.evaluations,
    existing: state.requirements
  });
  const coordinationActions = buildCoordinationActions({
    changeId: activeChangeId,
    conflicts: coordination.conflicts,
    existing: state.coordinationActions
  });
  const completionReadiness = evaluateCompletionReadiness({
    requirements,
    interventions,
    reviewQueue
  });

  const reviewState = {
    risk: reviewQueue.summary.highRisk > 0 ? 'HIGH' : 'LOW',
    requiresHumanDecision: reviewQueue.summary.requiresDecision > 0,
    reasons: reviewQueue.items
      .filter((item) => item.requiresHumanApproval)
      .map((item) => item.risk.reason)
      .slice(0, 5)
  };

  const activeEngineeringState = buildActiveEngineeringState({
    changeId: activeChangeId,
    requirements,
    interventions,
    contextState: context,
    coordinationState: {
      conflicts: coordination.conflicts,
      actions: coordinationActions,
      claims: coordination.claims
    },
    assuranceState: {
      score: assurance?.score ?? 0,
      status: assurance?.status || 'in_progress'
    },
    reviewState,
    completionReadiness
  });

  return {
    ...policyInput,
    policy,
    interventions,
    requirements,
    coordinationActions,
    completionReadiness,
    activeEngineeringState
  };
}

function inferProposedOwnership(activeChangeSession = {}, model = {}) {
  const files = activeChangeSession?.files || activeChangeSession?.change_proposal?.scope?.declaredFiles || [];
  return files
    .map((file) => {
      const lower = String(file).toLowerCase();
      const capability = /analytics/.test(lower) ? 'analytics.execution' : null;
      if (!capability) return null;
      return {
        capability,
        runtime: /\.rs$|worker/.test(lower) ? 'WASM Worker Runtime' : 'Node Development Runtime'
      };
    })
    .filter(Boolean);
}

function buildEvidenceFreshness(evidence = []) {
  const stale = (evidence || []).filter((entry) => entry.status === 'stale').length;
  const missing = (evidence || []).filter((entry) => entry.status === 'missing').length;
  if (missing) return 'invalidated';
  if (stale) return 'stale';
  if (!(evidence || []).length) return 'unknown';
  return 'current';
}

module.exports = {
  runControlPlane
};
