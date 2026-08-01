const { evaluateArchitecture } = require('./architecture');
const { evaluateRuntime } = require('./runtime');
const { evaluateContracts } = require('./contracts');
const { evaluateCapabilities } = require('./capabilities');
const { evaluateIntegration } = require('./integration');
const { evaluateBehavior } = require('./behavior');
const { evaluateEvidenceFreshness } = require('./evidence-freshness');

function buildAssuranceMatrix(input = {}) {
  return {
    changeId: input.changeId || null,
    dimensions: {
      architecture: evaluateArchitecture(input),
      runtime: evaluateRuntime(input.topology || {}),
      contract: evaluateContracts(input.contractRegistry || {}),
      capability: evaluateCapabilities(input.topology || {}),
      integration: evaluateIntegration({ transports: input.topology?.transports || [], evidence: input.evidence || [] }),
      behavior: evaluateBehavior({ assurance: input.assurance || {}, verification: input.verification || {} }),
      security: { status: 'NOT APPLICABLE', details: ['Security dimension not provided by current runtime evidence'] },
      operational: evaluateEvidenceFreshness(input.evidence || [])
    }
  };
}

module.exports = {
  buildAssuranceMatrix
};
