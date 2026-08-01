function buildRelevantSystem(model = {}, proposal = {}) {
  const declaredFiles = new Set(proposal.scope?.declaredFiles || []);
  const important = (model.importantFiles || []).filter((entry) => declaredFiles.size === 0 || declaredFiles.has(entry.file));
  const capabilityNames = important
    .filter((entry) => /capability|service|feature|analytics/i.test(entry.file))
    .map((entry) => entry.file.replace(/\.[^.]+$/, '').replace(/^.*\//, ''));
  const contracts = (model.contracts || [])
    .filter((entry) => declaredFiles.size === 0 || declaredFiles.has(entry.file))
    .map((entry) => entry.name || entry.file);
  return {
    capabilities: Array.from(new Set(capabilityNames)).slice(0, 6),
    runtimes: (model.runtimes || []).slice(0, 6),
    contracts: Array.from(new Set(contracts)).slice(0, 6),
    importantFiles: important.slice(0, 8).map((entry) => ({
      path: entry.file,
      reason: 'Primary capability or impact surface'
    }))
  };
}

module.exports = {
  buildRelevantSystem
};
