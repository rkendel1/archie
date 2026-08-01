function inferContractParticipants(model = {}, contract = {}) {
  const name = String(contract.name || contract.file || '').toLowerCase();
  const consumers = [];
  const producers = [];
  for (const module of model.modules || []) {
    const file = String(module.file || '');
    if (!file) continue;
    if (file.toLowerCase().includes(name)) {
      producers.push({ id: file, runtime: module.runtime || null, language: module.language || null });
      continue;
    }
    if ((module.dependencies || []).some((dependency) => String(dependency).toLowerCase().includes(name))) {
      consumers.push({ id: file, runtime: module.runtime || null, language: module.language || null });
    }
  }
  return {
    consumers: dedupe(consumers, (item) => item.id),
    producers: dedupe(producers, (item) => item.id)
  };
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
  inferContractParticipants
};
