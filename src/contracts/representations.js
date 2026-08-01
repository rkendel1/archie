function inferContractRepresentations(model = {}, contract = {}) {
  const name = contract.name || baseName(contract.file);
  const representations = [];
  for (const module of model.modules || []) {
    if (!module.file) continue;
    if (!module.file.toLowerCase().includes(name.toLowerCase())) continue;
    representations.push({
      kind: representationKind(module.file, module.language),
      file: module.file,
      language: module.language || null,
      source: 'observed-module'
    });
  }
  if (contract.file) {
    representations.push({
      kind: representationKind(contract.file, contract.language),
      file: contract.file,
      language: contract.language || null,
      source: 'canonical-candidate'
    });
  }
  return dedupe(representations, (item) => `${item.kind}:${item.file}`);
}

function representationKind(file = '', language = '') {
  const ext = file.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return 'typescript-type';
  if (ext === 'rs') return 'rust-struct';
  if (ext === 'py') return 'python-model';
  if (ext === 'json') return 'json-schema';
  if (ext === 'yml' || ext === 'yaml') return 'openapi-schema';
  if (/sql/.test(ext || '')) return 'sql-schema';
  if (/rust/i.test(language || '')) return 'rust-struct';
  if (/python/i.test(language || '')) return 'python-model';
  return 'implementation-representation';
}

function baseName(file = '') {
  return String(file).split('/').pop()?.replace(/\.[^.]+$/, '') || 'contract';
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
  inferContractRepresentations,
  representationKind
};
