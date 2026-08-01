const { buildRelevantSystem } = require('./relevance');
const { buildConstraints } = require('./constraints');
const { buildRequiredEvidence } = require('./evidence');
const { buildUncertainties } = require('./uncertainty');

function assembleChangeContext({ proposal = {}, model = {}, interventions = [] } = {}) {
  const relevant = buildRelevantSystem(model, proposal);
  return {
    change: {
      id: proposal.id || null,
      intent: proposal.intent?.summary || proposal.intent?.desiredOutcome || ''
    },
    relevantSystem: {
      capabilities: relevant.capabilities,
      runtimes: relevant.runtimes,
      contracts: relevant.contracts
    },
    constraints: buildConstraints(proposal, interventions),
    importantFiles: relevant.importantFiles,
    requiredEvidence: buildRequiredEvidence(proposal, interventions),
    uncertainties: buildUncertainties(model)
  };
}

module.exports = {
  assembleChangeContext
};
