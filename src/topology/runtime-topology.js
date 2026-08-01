const { inferRuntimeBoundaries } = require('./runtime-boundaries');
const { inferRuntimeTransports } = require('./transports');
const { inferCapabilityOwnership } = require('./capability-ownership');

function buildRuntimeTopology(model = {}) {
  const runtimes = (model.runtimes || []).map((name) => ({
    id: `runtime_${slug(name)}`,
    name,
    authority: /worker/i.test(name) ? 'high' : 'medium'
  }));
  const runtimeNames = runtimes.map((runtime) => runtime.name);
  const boundaries = inferRuntimeBoundaries(runtimeNames);
  const transports = inferRuntimeTransports(model, boundaries);
  const capabilityOwnership = inferCapabilityOwnership(model);
  const contracts = (model.contracts || []).map((contract) => ({
    contractId: contract.name || contract.file,
    runtime: /rust/i.test(contract.language || '') ? 'WASM Worker Runtime' : 'Node Development Runtime',
    representation: contract.file
  }));
  const topologyConfidence = confidence({ runtimes, boundaries, transports, capabilityOwnership, contracts });

  return {
    runtimes,
    boundaries,
    transports,
    capabilityOwnership,
    contracts,
    topologyConfidence
  };
}

function confidence(topology) {
  const hasRuntime = topology.runtimes.length > 0 ? 0.25 : 0;
  const hasBoundaries = topology.boundaries.length > 0 ? 0.2 : 0;
  const hasTransports = topology.transports.length > 0 ? 0.2 : 0;
  const hasOwnership = topology.capabilityOwnership.length > 0 ? 0.25 : 0;
  const hasContracts = topology.contracts.length > 0 ? 0.1 : 0;
  return Number((hasRuntime + hasBoundaries + hasTransports + hasOwnership + hasContracts).toFixed(2));
}

function slug(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

module.exports = {
  buildRuntimeTopology
};
