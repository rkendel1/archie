function extractSharedResources(change = {}) {
  const proposal = change.change_proposal || {};
  const files = proposal.scope?.declaredFiles || change.files || [];
  const contracts = proposal.contracts || [];
  const runtimes = change.system_impact?.runtimes ? ['runtime-impact'] : [];
  return {
    changeId: change.id,
    files: unique(files),
    contracts: unique(contracts),
    runtimes: unique(runtimes)
  };
}

function unique(value = []) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry).trim()).filter(Boolean)));
}

module.exports = {
  extractSharedResources
};
