function detectChangeConflicts(resources = []) {
  const conflicts = [];
  for (let i = 0; i < resources.length; i += 1) {
    for (let j = i + 1; j < resources.length; j += 1) {
      const sharedFiles = intersect(resources[i].files, resources[j].files);
      const sharedContracts = intersect(resources[i].contracts, resources[j].contracts);
      if (!sharedFiles.length && !sharedContracts.length) continue;
      conflicts.push({
        changeIds: [resources[i].changeId, resources[j].changeId],
        sharedFiles,
        sharedContracts,
        severity: sharedContracts.length ? 'high' : 'medium'
      });
    }
  }
  return conflicts;
}

function intersect(a = [], b = []) {
  const left = new Set((a || []).map((entry) => String(entry).toLowerCase()));
  return (b || []).filter((entry) => left.has(String(entry).toLowerCase()));
}

module.exports = {
  detectChangeConflicts
};
