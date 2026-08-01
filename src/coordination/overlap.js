function overlap(a = [], b = []) {
  const left = new Set((a || []).map((entry) => String(entry).toLowerCase()));
  const out = [];
  for (const entry of b || []) {
    const key = String(entry).toLowerCase();
    if (left.has(key)) out.push(entry);
  }
  return out;
}

function detectScopeOverlap(left = {}, right = {}) {
  const files = overlap(left.files, right.files);
  const capabilities = overlap(left.capabilities, right.capabilities);
  const contracts = overlap(left.contracts, right.contracts);
  const runtimes = overlap(left.runtimes, right.runtimes);
  return {
    files,
    capabilities,
    contracts,
    runtimes,
    hasOverlap: Boolean(files.length || capabilities.length || contracts.length || runtimes.length)
  };
}

module.exports = {
  overlap,
  detectScopeOverlap
};
