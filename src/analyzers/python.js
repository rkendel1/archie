const fs = require('node:fs');
const path = require('node:path');

const PYTHON_CONFIG_FILES = [
  'pyproject.toml',
  'requirements.txt',
  'requirements-dev.txt',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'uv.lock'
];

const AI_PACKAGES = ['langchain', 'llamaindex', 'torch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy'];

function rel(root, absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

function isPythonFile(file) {
  return /\.py$/i.test(file);
}

function moduleName(file) {
  const normalized = file.replace(/\\/g, '/');
  if (!normalized.endsWith('.py')) return null;
  let name = normalized.replace(/\.py$/, '').replace(/\//g, '.');
  if (name.endsWith('.__init__')) name = name.replace(/\.__init__$/, '');
  if (name.startsWith('src.')) name = name.slice(4);
  return name;
}

function parseRequirements(content) {
  const out = [];
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [name] = line.split(/[<>=!~\[]/);
    if (name) out.push(name.trim());
  }
  return out;
}

function classifyImport(target) {
  if (!target) return 'dynamic_or_unresolved';
  if (target.startsWith('.')) return 'internal_module';
  if (!target.includes('.')) {
    const stdlib = new Set(['sys', 'os', 'json', 're', 'math', 'typing', 'dataclasses', 'enum', 'pathlib', 'asyncio']);
    if (stdlib.has(target)) return 'standard_library';
  }
  return /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)*$/i.test(target) ? 'external_package' : 'dynamic_or_unresolved';
}

function analyzeRepository(root, filesAbs) {
  const files = [];
  const modules = [];
  const symbols = [];
  const dependencies = [];
  const entryPoints = [];
  const runtimes = [];
  const contracts = [];
  const tests = [];
  const frameworks = [];
  const configuration = [];
  const technologies = [];
  const diagnostics = [];
  const evidence = [];
  const discoveredDependencies = new Set();

  for (const configFile of PYTHON_CONFIG_FILES) {
    const abs = path.join(root, configFile);
    if (!fs.existsSync(abs)) continue;
    configuration.push({ file: configFile, language: 'python', kind: 'python-config' });
    if (/requirements/.test(configFile)) {
      for (const dep of parseRequirements(fs.readFileSync(abs, 'utf8'))) {
        discoveredDependencies.add(dep.toLowerCase());
      }
    }
    if (configFile === 'pyproject.toml') {
      const pyproject = fs.readFileSync(abs, 'utf8');
      const scripts = pyproject.match(/^\s*[A-Za-z0-9_.-]+\s*=\s*["'][^"']+["']/gm) || [];
      for (const script of scripts) {
        const [, rhs] = script.split('=').map((chunk) => chunk.trim());
        if (!rhs) continue;
        const value = rhs.replace(/^["']|["']$/g, '');
        const [module, symbol] = value.split(':');
        if (module?.endsWith('.py')) entryPoints.push({ file: module, symbol, language: 'python', runtime: 'Python CLI Runtime', confidence: { value: 0.8, status: 'inferred' } });
      }
    }
  }

  const moduleToFile = new Map();
  for (const abs of filesAbs) {
    const file = rel(root, abs);
    if (!isPythonFile(file)) continue;
    const name = moduleName(file);
    files.push({ path: file, language: 'python' });
    const moduleId = `module:python:${name}`;
    modules.push({ id: moduleId, kind: 'module', name, language: 'python', file });
    moduleToFile.set(name, file);
  }

  for (const abs of filesAbs) {
    const file = rel(root, abs);
    if (!isPythonFile(file)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    const module = moduleName(file);
    const moduleId = `module:python:${module}`;

    if (/\bFastAPI\s*\(/.test(content)) {
      runtimes.push({ id: 'runtime:python.fastapi', name: 'Python FastAPI Runtime', language: 'python', technology: 'fastapi', confidence: { value: 0.98, status: 'observed' } });
      frameworks.push({ name: 'fastapi', language: 'python' });
      technologies.push({ name: 'fastapi', language: 'python', source: file });
      entryPoints.push({ file, symbol: 'app', language: 'python', runtime: 'Python FastAPI Runtime', confidence: { value: 0.9, status: 'observed' } });
    }
    if (/\bFlask\s*\(/.test(content)) {
      runtimes.push({ id: 'runtime:python.flask', name: 'Python Flask Runtime', language: 'python', technology: 'flask', confidence: { value: 0.95, status: 'observed' } });
      frameworks.push({ name: 'flask', language: 'python' });
      entryPoints.push({ file, symbol: 'app', language: 'python', runtime: 'Python Flask Runtime', confidence: { value: 0.9, status: 'observed' } });
    }
    if (/if\s+__name__\s*==\s*['"]__main__['"]/.test(content)) {
      runtimes.push({ id: 'runtime:python.cli', name: 'Python CLI Runtime', language: 'python', confidence: { value: 0.9, status: 'observed' } });
      entryPoints.push({ file, language: 'python', runtime: 'Python CLI Runtime', confidence: { value: 1, status: 'observed' } });
    }
    if (/Celery\s*\(/.test(content) || /\bcelery\b/i.test(content)) {
      runtimes.push({ id: 'runtime:python.celery', name: 'Python Celery Worker', language: 'python', confidence: { value: 0.85, status: 'inferred' } });
      technologies.push({ name: 'celery', language: 'python', source: file });
    }
    if (/\brq\b/i.test(content)) {
      runtimes.push({ id: 'runtime:python.rq', name: 'Python RQ Worker', language: 'python', confidence: { value: 0.75, status: 'inferred' } });
      technologies.push({ name: 'rq', language: 'python', source: file });
    }
    if (/manage\.py/.test(file) || /DJANGO_SETTINGS_MODULE/.test(content)) {
      runtimes.push({ id: 'runtime:python.django', name: 'Python Django Runtime', language: 'python', confidence: { value: 0.9, status: 'observed' } });
      frameworks.push({ name: 'django', language: 'python' });
    }
    if (/click\.command|typer\.Typer|argparse\.ArgumentParser/.test(content)) {
      runtimes.push({ id: 'runtime:python.cli', name: 'Python CLI Runtime', language: 'python', confidence: { value: 0.75, status: 'inferred' } });
    }

    const importRe = /^\s*import\s+([A-Za-z0-9_.,\s]+)|^\s*from\s+([.\w]+)\s+import\s+([A-Za-z0-9_*,\s]+)/gm;
    let importMatch;
    while ((importMatch = importRe.exec(content))) {
      const direct = importMatch[1];
      if (direct) {
        for (const part of direct.split(',').map((x) => x.trim()).filter(Boolean)) {
          const normalized = part.split(/\s+as\s+/)[0].trim();
          const dependencyKind = classifyImport(normalized);
          dependencies.push({
            from: moduleId,
            to: dependencyKind === 'internal_module' ? `module:python:${normalized.replace(/^\.+/, '')}` : `module:python:${normalized}`,
            kind: 'imports',
            language: 'python',
            dependency_type: dependencyKind,
            confidence: { value: 1, status: 'observed' }
          });
          discoveredDependencies.add(normalized.split('.')[0].toLowerCase());
        }
      }
      const fromTarget = importMatch[2];
      if (fromTarget) {
        const dependencyKind = classifyImport(fromTarget);
        dependencies.push({
          from: moduleId,
          to: dependencyKind === 'internal_module' ? `module:python:${fromTarget.replace(/^\.+/, '')}` : `module:python:${fromTarget}`,
          kind: 'imports',
          language: 'python',
          dependency_type: dependencyKind,
          confidence: { value: 1, status: 'observed' }
        });
        discoveredDependencies.add(fromTarget.replace(/^\.+/, '').split('.')[0].toLowerCase());
      }
    }

    const classRe = /^([ \t]*)class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*:/gm;
    let classMatch;
    while ((classMatch = classRe.exec(content))) {
      const [, indent, name, baseExpr = ''] = classMatch;
      const isMethodScope = indent.length > 0;
      if (isMethodScope) continue;
      const kind = /TypedDict/.test(baseExpr) ? 'typeddict' : /Protocol/.test(baseExpr) ? 'protocol' : /Enum/.test(baseExpr) ? 'enum' : /BaseModel/.test(baseExpr) ? 'pydantic-model' : /Base\b/.test(baseExpr) ? 'class' : 'class';
      const id = `symbol:python:${module}:${name}`;
      symbols.push({
        id,
        kind,
        name,
        language: 'python',
        file,
        line: content.slice(0, classMatch.index).split('\n').length,
        exported: !name.startsWith('_'),
        runtime: 'python',
        confidence: { value: 0.95, status: 'observed' }
      });
      if (/BaseModel|TypedDict|Protocol|dataclass|Enum|DeclarativeBase|db\.Model/.test(baseExpr)) {
        contracts.push({
          id: `contract:python:${module}:${name}`,
          name,
          language: 'python',
          file,
          module: moduleId,
          confidence: { value: 0.9, status: 'observed' }
        });
      }
    }

    const fnRe = /^([ \t]*)(async\s+def|def)\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
    let fnMatch;
    while ((fnMatch = fnRe.exec(content))) {
      const [, indent, keyword, name] = fnMatch;
      const isMethod = indent.length > 0;
      symbols.push({
        id: `symbol:python:${module}:${name}`,
        kind: keyword.startsWith('async') ? (isMethod ? 'async-method' : 'async-function') : (isMethod ? 'method' : 'function'),
        name,
        language: 'python',
        file,
        line: content.slice(0, fnMatch.index).split('\n').length,
        exported: !name.startsWith('_') && !isMethod,
        runtime: 'python',
        confidence: { value: 0.95, status: 'observed' }
      });
      if (/^test_/.test(name) || file.includes('/tests/') || file.startsWith('tests/')) {
        tests.push({
          file,
          symbol: name,
          framework: /unittest/.test(content) ? 'unittest' : 'pytest',
          language: 'python',
          implementation: null,
          confidence: { value: 0.9, status: 'inferred' }
        });
      }
    }

    if (/importlib\.import_module|\b__import__\(/.test(content)) {
      diagnostics.push({
        kind: 'uncertainty',
        file,
        message: 'Dynamic imports detected; some dependencies may be unresolved',
        confidence: { value: 0.7, status: 'inferred' }
      });
    }
  }

  for (const testEntry of tests) {
    const testFile = testEntry.file;
    const baseName = path.basename(testFile).replace(/^test_/, '').replace(/_test\.py$/, '').replace(/\.py$/, '');
    const candidate = Array.from(moduleToFile.entries()).find(([module]) => module.endsWith(`.${baseName}`) || module === baseName);
    if (candidate) {
      testEntry.implementation = candidate[1];
    }
  }

  for (const aiPackage of AI_PACKAGES) {
    if (!discoveredDependencies.has(aiPackage) && !discoveredDependencies.has(aiPackage.replace('-', ''))) continue;
    technologies.push({ name: aiPackage, language: 'python', source: 'dependency' });
  }

  if (files.length > 0) {
    runtimes.push({ id: 'runtime:python.generic', name: 'Python Service Runtime', language: 'python', confidence: { value: 0.6, status: 'inferred' } });
    evidence.push({ type: 'analysis', message: `${files.length} python files analyzed`, status: 'observed' });
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
    diagnostics,
    confidence: [{ scope: 'python', value: files.length ? 0.82 : 0, status: files.length ? 'observed' : 'unknown' }],
    evidence,
    technologies
  };
}

const pythonAnalyzer = {
  id: 'archie-python',
  version: '1.0',
  languages: ['python'],
  capabilities: ['modules', 'symbols', 'imports', 'runtimes', 'contracts', 'tests'],
  supportsIncrementalAnalysis: true,
  canAnalyze(file) {
    return isPythonFile(file) || PYTHON_CONFIG_FILES.includes(path.basename(file));
  },
  analyzeRepository
};

module.exports = { pythonAnalyzer };
