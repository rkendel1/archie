const { buildCanonicalContract } = require('./canonical');
const { detectContractRepresentationDrift } = require('./drift');

function buildContractRegistry(model = {}) {
  const canonicalContracts = (model.contracts || []).map((contract) => buildCanonicalContract(model, contract));
  const drift = canonicalContracts.flatMap((contract) => detectContractRepresentationDrift(contract));
  return {
    contracts: canonicalContracts,
    drift,
    confidence: Number((canonicalContracts.reduce((sum, contract) => sum + Number(contract.confidence || 0), 0) / Math.max(canonicalContracts.length, 1)).toFixed(2))
  };
}

module.exports = {
  buildContractRegistry
};
