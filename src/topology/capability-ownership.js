function inferCapabilityOwnership(model = {}) {
  const entries = [];
  const files = Array.isArray(model.importantFiles) ? model.importantFiles : [];
  for (const file of files) {
    const name = String(file.file || '').toLowerCase();
    if (!/(capability|analytics|worker|service|runtime)/.test(name)) continue;
    const capability = /analytics/.test(name) ? 'analytics.execution' : pathToCapability(file.file);
    const runtime = /\.rs$|worker/.test(name) ? 'WASM Worker Runtime' : 'Node Development Runtime';
    entries.push({ capability, runtime, sourceFile: file.file, confidence: 0.82 });
  }
  return dedupe(entries, (item) => `${item.capability}:${item.runtime}`);
}

function detectCompetingOwnership(ownership = [], proposedOwnership = []) {
  const canonical = new Map();
  for (const item of ownership) {
    if (!canonical.has(item.capability)) canonical.set(item.capability, item.runtime);
  }
  const conflicts = [];
  for (const item of proposedOwnership) {
    const canonicalRuntime = canonical.get(item.capability);
    if (canonicalRuntime && canonicalRuntime !== item.runtime) {
      conflicts.push({
        type: 'RUNTIME_OWNERSHIP_CONFLICT',
        capability: item.capability,
        canonicalRuntime,
        proposedRuntime: item.runtime,
        message: `Competing runtime ownership detected for ${item.capability}`
      });
    }
  }
  return conflicts;
}

function pathToCapability(filePath = '') {
  return String(filePath)
    .replace(/^src\//, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[\/]/g, '.') || 'unknown.capability';
}

function dedupe(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

module.exports = {
  inferCapabilityOwnership,
  detectCompetingOwnership,
  pathToCapability
};
