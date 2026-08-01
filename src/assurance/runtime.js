function evaluateRuntime(topology = {}) {
  if (!topology.runtimes?.length) return { status: 'NOT VERIFIED', details: ['No runtimes detected'] };
  if (topology.topologyConfidence < 0.5) return { status: 'WARNING', details: ['Runtime topology confidence is low'] };
  return { status: 'PASS', details: ['Runtime topology modeled with confidence'] };
}

module.exports = {
  evaluateRuntime
};
