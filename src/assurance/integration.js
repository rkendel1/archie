function evaluateIntegration({ transports = [], evidence = [] } = {}) {
  if (!transports.length) return { status: 'NOT VERIFIED', details: ['No runtime transport paths identified'] };
  const stale = evidence.filter((entry) => entry.status === 'stale').length;
  if (stale) return { status: 'WARNING', details: ['Integration evidence is stale'] };
  return { status: 'PASS', details: ['Integration pathways and evidence are current'] };
}

module.exports = {
  evaluateIntegration
};
