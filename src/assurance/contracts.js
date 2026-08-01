function evaluateContracts(contractRegistry = {}) {
  const drift = contractRegistry.drift || [];
  if (!contractRegistry.contracts?.length) return { status: 'NOT VERIFIED', details: ['No canonical contracts registered'] };
  if (drift.length) return { status: 'WARNING', details: drift.map((entry) => entry.message) };
  return { status: 'PASS', details: ['Canonical contracts and representations are aligned'] };
}

module.exports = {
  evaluateContracts
};
