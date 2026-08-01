function emptyObservation() {
  return {
    files: [],
    symbols: [],
    modules: [],
    dependencies: [],
    entryPoints: [],
    runtimes: [],
    contracts: [],
    schemas: [],
    tests: [],
    frameworks: [],
    configuration: [],
    diagnostics: [],
    confidence: [],
    evidence: [],
    technologies: []
  };
}

function mergeByKey(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, item);
  }
  return Array.from(map.values());
}

function mergeObservations(observations) {
  const merged = emptyObservation();
  for (const entry of observations) {
    if (!entry) continue;
    for (const field of Object.keys(merged)) {
      merged[field].push(...(entry[field] || []));
    }
  }
  merged.files = mergeByKey(merged.files, (item) => item.path);
  merged.symbols = mergeByKey(merged.symbols, (item) => item.id);
  merged.modules = mergeByKey(merged.modules, (item) => item.id);
  merged.dependencies = mergeByKey(merged.dependencies, (item) => `${item.from}::${item.kind}::${item.to}`);
  merged.entryPoints = mergeByKey(merged.entryPoints, (item) => `${item.file}::${item.symbol || ''}`);
  merged.runtimes = mergeByKey(merged.runtimes, (item) => item.id || item.name);
  merged.contracts = mergeByKey(merged.contracts, (item) => item.id || `${item.name}::${item.file}`);
  merged.schemas = mergeByKey(merged.schemas, (item) => item.id || `${item.name}::${item.file}`);
  merged.tests = mergeByKey(merged.tests, (item) => `${item.file}::${item.symbol || ''}`);
  merged.frameworks = mergeByKey(merged.frameworks, (item) => `${item.name}::${item.language || ''}`);
  merged.configuration = mergeByKey(merged.configuration, (item) => item.file);
  merged.technologies = mergeByKey(merged.technologies, (item) => `${item.name}::${item.language || ''}`);
  return merged;
}

function languageDistribution(observation) {
  const counts = new Map();
  for (const file of observation.files) {
    const language = String(file.language || 'unknown').toLowerCase();
    counts.set(language, (counts.get(language) || 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0) || 1;
  return Array.from(counts.entries())
    .map(([language, count]) => ({
      language,
      count,
      percentage: Math.round((count / total) * 100)
    }))
    .sort((a, b) => b.count - a.count);
}

module.exports = {
  emptyObservation,
  mergeObservations,
  languageDistribution
};
