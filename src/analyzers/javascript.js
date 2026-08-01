const fs = require('node:fs');
const path = require('node:path');

function rel(root, absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

function isJsFile(file) {
  return /\.(js|cjs|mjs|jsx|ts|tsx)$/i.test(file);
}

function analyzeRepository(root, filesAbs) {
  const files = [];
  const modules = [];
  const symbols = [];
  const dependencies = [];
  const entryPoints = [];
  const contracts = [];
  const tests = [];
  const frameworks = [];
  const technologies = [];
  const configuration = [];
  const runtimes = [{ id: 'runtime:node.development', name: 'Node Development Runtime', language: 'javascript', confidence: { value: 1, status: 'observed' } }];

  const pkgPath = path.join(root, 'package.json');
  let pkg = null;
  if (fs.existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      configuration.push({ file: 'package.json', language: 'javascript', kind: 'package-config' });
    } catch {
      pkg = null;
    }
  }

  const known = ['react', 'next', 'vite', 'electron', 'express', 'fastify', 'nestjs', 'typescript'];
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  for (const name of known) {
    if (!deps[name]) continue;
    frameworks.push({ name, version: deps[name], language: 'javascript' });
    technologies.push({ name, language: 'javascript', source: 'package.json' });
    if (name === 'electron') {
      runtimes.push({ id: 'runtime:electron.desktop', name: 'Electron Desktop Host', language: 'javascript', confidence: { value: 0.95, status: 'observed' } });
    }
    if (name === 'react' || name === 'next') {
      runtimes.push({ id: 'runtime:browser', name: 'Browser Runtime', language: 'javascript', confidence: { value: 0.9, status: 'inferred' } });
    }
  }

  for (const abs of filesAbs) {
    const file = rel(root, abs);
    if (!isJsFile(file)) continue;
    files.push({ path: file, language: 'javascript' });
    const moduleId = `module:javascript:${file.replace(/[^\w./-]+/g, '_')}`;
    modules.push({ id: moduleId, name: file, language: 'javascript', file, kind: 'module' });
    const content = fs.readFileSync(abs, 'utf8');
    const importRe = /\bimport\s+.*?\s+from\s+['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)/g;
    let match;
    while ((match = importRe.exec(content))) {
      const dep = match[1] || match[2];
      dependencies.push({
        from: moduleId,
        to: dep.startsWith('.') ? `module:javascript:${dep}` : `package:${dep}`,
        kind: 'imports',
        language: 'javascript',
        confidence: { value: 1, status: 'observed' }
      });
    }
    if (/(contract|schema|manifest|types?)/i.test(path.basename(file))) {
      contracts.push({
        id: `contract:javascript:${file}`,
        name: path.basename(file, path.extname(file)),
        language: 'javascript',
        file,
        confidence: { value: 0.9, status: 'inferred' }
      });
    }
    if (/(\.test\.|\.spec\.|__tests__)/.test(path.basename(file))) {
      tests.push({ file, framework: 'node:test', language: 'javascript', confidence: { value: 0.85, status: 'inferred' } });
    }
  }

  if (pkg?.main) {
    entryPoints.push({ file: pkg.main, language: 'javascript', runtime: 'Node Development Runtime', confidence: { value: 1, status: 'observed' } });
  }
  if (pkg?.bin) {
    if (typeof pkg.bin === 'string') entryPoints.push({ file: pkg.bin, language: 'javascript', runtime: 'Node Development Runtime', confidence: { value: 0.95, status: 'observed' } });
    if (typeof pkg.bin === 'object') {
      for (const value of Object.values(pkg.bin)) {
        entryPoints.push({ file: value, language: 'javascript', runtime: 'Node Development Runtime', confidence: { value: 0.95, status: 'observed' } });
      }
    }
  }

  return {
    files,
    symbols,
    modules,
    dependencies,
    entryPoints,
    runtimes,
    contracts,
    schemas: [],
    tests,
    frameworks,
    configuration,
    diagnostics: [],
    confidence: [{ scope: 'javascript', value: 0.85, status: 'inferred' }],
    evidence: [],
    technologies
  };
}

const javascriptAnalyzer = {
  id: 'archie-javascript',
  version: '1.0',
  languages: ['javascript', 'typescript'],
  capabilities: ['modules', 'symbols', 'imports', 'runtimes', 'contracts', 'tests'],
  supportsIncrementalAnalysis: true,
  canAnalyze(file) {
    return isJsFile(file);
  },
  analyzeRepository
};

module.exports = { javascriptAnalyzer };
