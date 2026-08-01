function detectDependencies(resources = []) {
  const dependencies = [];
  for (let i = 0; i < resources.length; i += 1) {
    for (let j = i + 1; j < resources.length; j += 1) {
      const sharedContracts = intersect(resources[i].contracts, resources[j].contracts);
      if (!sharedContracts.length) continue;
      dependencies.push({
        from: resources[i].changeId,
        to: resources[j].changeId,
        reason: `Shared contract(s): ${sharedContracts.join(', ')}`,
        contracts: sharedContracts
      });
    }
  }
  return dependencies;
}

function intersect(a = [], b = []) {
  const left = new Set((a || []).map((entry) => String(entry).toLowerCase()));
  return (b || []).filter((entry) => left.has(String(entry).toLowerCase()));
}

module.exports = {
  detectDependencies
};
