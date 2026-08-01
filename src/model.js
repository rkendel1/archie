const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { analyzeRepository: analyzeWithRegistry } = require('./analyzers');

const MODEL_DIR = '.archie';
const MODEL_FILE = 'system-model.json';
const CONFIG_FILE = 'config.json';
const DECISIONS_FILE = 'decisions.json';

function walkFiles(rootDir, out = [], depth = 0) {
  if (depth > 10) return out;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === '.archie' ||
      entry.name.startsWith('.archie-cache')
    ) continue;
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) walkFiles(abs, out, depth + 1);
    else out.push(abs);
  }
  return out;
}

function rel(root, absPath) {
  return path.relative(root, absPath).replace(/\\/g, '/');
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function discoverLanguages(files) {
  const counts = new Map();
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || '<none>';
    counts.set(ext, (counts.get(ext) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => ({ ext, count }));
}

function languageLabel(language) {
  const normalized = String(language || '').toLowerCase();
  if (normalized === 'javascript') return 'JavaScript';
  if (normalized === 'typescript') return 'TypeScript';
  if (normalized === 'python') return 'Python';
  if (normalized === 'rust') return 'Rust';
  if (normalized === 'go') return 'Go';
  if (normalized === 'java') return 'Java';
  if (normalized === 'configuration') return 'Configuration';
  return normalized ? normalized[0].toUpperCase() + normalized.slice(1) : 'Unknown';
}

function normalizeLanguageSummary(entries = []) {
  return entries.map((entry) => ({
    language: languageLabel(entry.language),
    key: String(entry.language || '').toLowerCase(),
    count: Number(entry.count || 0),
    percentage: Number(entry.percentage || 0)
  }));
}

function discoverFrameworks(root) {
  const pkg = readJsonIfExists(path.join(root, 'package.json')) || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const known = ['react', 'next', 'vite', 'electron', 'express', 'fastify', 'nestjs', 'typescript'];
  return known.filter((k) => deps[k]).map((name) => ({ name, version: deps[name] }));
}

function identifyEntryPoints(root) {
  const entryPoints = [];
  const pkg = readJsonIfExists(path.join(root, 'package.json'));
  if (pkg) {
    if (pkg.main) entryPoints.push(pkg.main);
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') entryPoints.push(pkg.bin);
      if (typeof pkg.bin === 'object') entryPoints.push(...Object.values(pkg.bin));
    }
    if (pkg.scripts) {
      for (const cmd of Object.values(pkg.scripts)) {
        if (/node\s+\S+|tsx\s+\S+|ts-node\s+\S+/.test(cmd)) {
          const match = cmd.match(/(?:node|tsx|ts-node)\s+([^\s]+)/);
          if (match?.[1]) entryPoints.push(match[1]);
        }
      }
    }
  }
  const defaults = ['src/index.ts', 'src/index.js', 'index.js', 'main.js'];
  for (const file of defaults) {
    if (fs.existsSync(path.join(root, file))) entryPoints.push(file);
  }
  return Array.from(new Set(entryPoints));
}

function detectRuntimes(root, files, frameworks) {
  const runtimes = new Set(['Node Development Runtime']);
  const lowerFiles = files.map((f) => rel(root, f).toLowerCase());
  if (frameworks.some((f) => f.name === 'electron') || lowerFiles.some((f) => f.includes('electron'))) {
    runtimes.add('Electron Desktop Host');
  }
  if (lowerFiles.some((f) => f.includes('worker') || f.includes('.rs'))) {
    runtimes.add('WASM Worker Runtime');
  }
  if (frameworks.some((f) => f.name === 'react' || f.name === 'next') || lowerFiles.some((f) => f.includes('browser') || f.includes('ui/'))) {
    runtimes.add('Browser Runtime');
  }
  return Array.from(runtimes);
}

function extractContracts(root, files) {
  const contracts = [];
  for (const abs of files) {
    const file = rel(root, abs);
    if (!/\.(ts|tsx|js|json|yaml|yml)$/i.test(file)) continue;
    const basename = path.basename(file).toLowerCase();
    if (/(contract|schema|manifest|types?)/.test(basename)) {
      contracts.push({ file, confidence: 0.9, reason: 'filename-pattern' });
      continue;
    }
    if (!/\.(ts|tsx|js)$/i.test(file)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    if (/\b(interface|type)\s+[A-Z]/.test(content) || /zod|yup|ajv|jsonschema/.test(content)) {
      contracts.push({ file, confidence: 0.7, reason: 'source-pattern' });
    }
  }
  return contracts;
}

function mapTests(root, files) {
  const tests = files.filter((f) => /(\.test\.|\.spec\.|__tests__)/.test(path.basename(f))).map((f) => rel(root, f));
  const links = [];
  for (const testFile of tests) {
    const base = testFile.replace(/(\.test|\.spec)\.[^.]+$/, '').replace(/__tests__\//, '');
    const impl = files.map((f) => rel(root, f)).find((f) => f.includes(base) && f !== testFile);
    if (impl) links.push({ test: testFile, implementation: impl });
  }
  return { tests, links };
}

function scoreFileImportance(root, files, contracts, testLinks) {
  const linkedTests = new Map();
  for (const link of testLinks) linkedTests.set(link.implementation, (linkedTests.get(link.implementation) || 0) + 1);
  const contractSet = new Set(contracts.map((c) => c.file));

  const rows = [];
  for (const abs of files) {
    const file = rel(root, abs);
    const isCode = /\.(ts|tsx|js|jsx|mjs|cjs|rs|go|py|java|json)$/.test(file);
    if (!isCode) continue;

    const content = fs.readFileSync(abs, 'utf8');
    const architectureAuthority = /(manifest|kernel|registry|runtime|planner)/i.test(file) ? 30 : 10;
    const runtimeReachability = /(index|main|app|server|worker|runtime)/i.test(file) ? 20 : 5;
    const dependencyCentrality = Math.min((content.match(/\b(import|require\(|from\s+['"])/g) || []).length, 15);
    const contractOwnership = contractSet.has(file) ? 15 : 0;
    const capabilityImpact = /(capability|feature|service|provider)/i.test(file) ? 10 : 3;
    const changeFrequency = 5;
    const failureImpact = linkedTests.has(file) ? 5 : 2;

    rows.push({
      file,
      score: architectureAuthority + runtimeReachability + dependencyCentrality + contractOwnership + capabilityImpact + changeFrequency + failureImpact,
      signals: { architectureAuthority, runtimeReachability, dependencyCentrality, contractOwnership, capabilityImpact, changeFrequency, failureImpact }
    });
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, 25);
}

function buildGraph(model) {
  const nodes = [{ id: 'product-intent', type: 'product-intent', label: 'Product Intent' }];
  const edges = [];
  const nodeIds = new Set(['product-intent']);

  for (const runtime of model.runtimes) {
    const id = `runtime:${runtime}`;
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    nodes.push({ id, type: 'runtime', label: runtime });
    edges.push({ from: 'product-intent', to: id, type: 'supports' });
  }

  for (const c of model.contracts) {
    const id = `contract:${c.file}`;
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    nodes.push({ id, type: 'contract', label: c.file, language: c.language || null });
    for (const runtime of model.runtimes) edges.push({ from: `runtime:${runtime}`, to: id, type: 'uses' });
  }

  for (const f of model.importantFiles) {
    const id = `file:${f.file}`;
    if (nodeIds.has(id)) continue;
    nodeIds.add(id);
    nodes.push({ id, type: 'implementation', label: f.file, importance: f.score, language: f.language || null });
    if (/(capability|service|feature)/i.test(f.file)) edges.push({ from: 'product-intent', to: id, type: 'capability' });
  }

  for (const module of model.modules || []) {
    if (nodeIds.has(module.id)) continue;
    nodeIds.add(module.id);
    nodes.push({
      id: module.id,
      type: module.kind || 'module',
      label: module.name,
      file: module.file,
      language: module.language || null,
      technology: module.technology || null,
      runtime: module.runtime || null
    });
  }

  for (const dependency of model.dependencies || []) {
    edges.push({
      from: dependency.from,
      to: dependency.to,
      type: dependency.kind || 'depends_on',
      language: dependency.language || null,
      confidence: dependency.confidence || null
    });
  }

  return { nodes, edges };
}

function inferArchitecture(model) {
  const languageSummary = (model.discovery?.languages || []).map((item) => `${item.language} ${item.percentage}%`).join(' · ');
  return [
    { layer: 'Product Intent', summary: 'Repository-level outcomes are inferred from runtime/capability markers.' },
    { layer: 'Runtimes', summary: model.runtimes.join(' · ') || 'No runtimes detected' },
    { layer: 'Languages', summary: languageSummary || 'No languages detected' },
    { layer: 'Contracts', summary: `${model.contracts.length} contract candidates detected` },
    { layer: 'Implementation', summary: `${model.importantFiles.length} important files ranked` },
    { layer: 'Evidence', summary: `${model.tests.tests.length} tests mapped` }
  ];
}

function findUncertainties(model) {
  const out = [];
  if (model.runtimes.includes('Browser Runtime') && model.runtimes.includes('Electron Desktop Host')) {
    out.push('Browser and Electron session ownership is ambiguous');
  }
  if (model.contracts.length === 0) out.push('No explicit contracts detected. Review contract detection patterns.');
  if (model.tests.tests.length === 0) out.push('No test evidence linked to implementation.');
  return out;
}

function confidence(model) {
  let score = 50;
  score += Math.min(model.contracts.length * 3, 20);
  score += Math.min(model.tests.tests.length * 2, 15);
  score += Math.min(model.importantFiles.length, 10);
  score -= model.uncertainties.length * 8;
  return Math.max(0, Math.min(100, score));
}

function ensureArchieDir(rootDir) {
  const dir = path.join(rootDir, MODEL_DIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function modelPath(rootDir) {
  return path.join(rootDir, MODEL_DIR, MODEL_FILE);
}

function configPath(rootDir) {
  return path.join(rootDir, MODEL_DIR, CONFIG_FILE);
}

function decisionsPath(rootDir) {
  return path.join(rootDir, MODEL_DIR, DECISIONS_FILE);
}

function loadDecisions(rootDir) {
  return readJsonIfExists(decisionsPath(rootDir)) || { confirmedUnderstanding: false, architectureCorrections: [] };
}

function saveDecisions(rootDir, decisions) {
  ensureArchieDir(rootDir);
  fs.writeFileSync(decisionsPath(rootDir), JSON.stringify(decisions, null, 2));
}

function confirmUnderstanding(rootDir) {
  const decisions = loadDecisions(rootDir);
  decisions.confirmedUnderstanding = true;
  saveDecisions(rootDir, decisions);
  return decisions;
}

function correctArchitecture(rootDir, correction) {
  const decisions = loadDecisions(rootDir);
  const normalized = String(correction || '').trim();
  if (normalized) decisions.architectureCorrections.push(normalized);
  decisions.confirmedUnderstanding = false;
  decisions.architectureCorrections = Array.from(new Set(decisions.architectureCorrections));
  saveDecisions(rootDir, decisions);
  return decisions;
}

function applyDecisions(model, decisions) {
  if (!decisions) return model;
  model.userDecisions = decisions;
  if (decisions.architectureCorrections?.length) {
    model.architecture = [
      ...model.architecture,
      { layer: 'User Corrections', summary: decisions.architectureCorrections.join(' | ') }
    ];
  }
  if (decisions.confirmedUnderstanding) {
    model.systemStatus = 'confirmed';
    model.uncertainties = [];
  } else {
    model.systemStatus = 'pending-review';
  }
  return model;
}

function buildModel(rootDir) {
  const absRoot = path.resolve(rootDir);
  const filesAbs = walkFiles(absRoot);
  const files = filesAbs.map((f) => rel(absRoot, f));
  const analysis = analyzeWithRegistry(absRoot, filesAbs);
  const observation = analysis.observation;
  const languageSummary = normalizeLanguageSummary(analysis.languages);
  const frameworks = observation.frameworks || discoverFrameworks(absRoot);
  const contracts = (observation.contracts || []).map((contract) => ({
    file: contract.file,
    name: contract.name,
    language: contract.language,
    confidence: contract.confidence?.value || 0.7,
    reason: contract.confidence?.status || 'observed'
  }));
  const tests = {
    tests: (observation.tests || []).map((entry) => entry.file),
    links: (observation.tests || [])
      .filter((entry) => entry.implementation)
      .map((entry) => ({
        test: entry.file,
        implementation: entry.implementation,
        confidence: entry.confidence?.value || 0.7
      }))
  };
  const runtimes = Array.from(new Set([
    ...(observation.runtimes || []).map((runtime) => runtime.name),
    ...detectRuntimes(absRoot, filesAbs, frameworks)
  ]));
  const entryPoints = (observation.entryPoints || []).map((entry) => entry.file);
  const packageJson = readJsonIfExists(path.join(absRoot, 'package.json')) || {};

  const model = {
    generatedAt: new Date().toISOString(),
    root: absRoot,
    analyzers: analysis.analyzers,
    discovery: {
      languages: languageSummary.length ? languageSummary : discoverLanguages(files).map((entry) => ({
        language: entry.ext,
        key: entry.ext,
        count: entry.count,
        percentage: 0
      })),
      frameworks,
      entryPoints: Array.from(new Set([...entryPoints, ...identifyEntryPoints(absRoot)])),
      applications: files.filter((f) => /app|service|api|worker|desktop|runtime/i.test(f)).slice(0, 100),
      dependencies: packageJson.dependencies || {},
      technologies: observation.technologies || []
    },
    runtimes,
    contracts,
    tests,
    modules: observation.modules || [],
    symbols: observation.symbols || [],
    dependencies: observation.dependencies || [],
    diagnostics: observation.diagnostics || [],
    importantFiles: scoreFileImportance(absRoot, filesAbs, contracts, tests.links).map((row) => {
      const language = observation.files?.find((file) => file.path === row.file)?.language || null;
      return { ...row, language };
    })
  };

  model.graph = buildGraph(model);
  model.architecture = inferArchitecture(model);
  model.uncertainties = findUncertainties(model);
  model.confidence = confidence(model);

  return applyDecisions(model, loadDecisions(absRoot));
}

function projectModelByLanguage(model, language) {
  const key = String(language || '').trim().toLowerCase();
  if (!key || key === 'all') return model;
  const allObservedFiles = new Set((model.modules || []).filter((module) => String(module.language || '').toLowerCase() === key).map((module) => module.file));
  for (const contract of model.contracts || []) {
    if (String(contract.language || '').toLowerCase() === key) allObservedFiles.add(contract.file);
  }
  const allowedNodeIds = new Set((model.graph?.nodes || []).filter((node) => String(node.language || '').toLowerCase() === key || node.type === 'product-intent' || node.type === 'runtime').map((node) => node.id));
  for (const runtime of model.runtimes || []) allowedNodeIds.add(`runtime:${runtime}`);

  const projected = {
    ...model,
    discovery: {
      ...model.discovery,
      languages: (model.discovery.languages || []).filter((entry) => String(entry.key || entry.language || '').toLowerCase() === key)
    },
    contracts: (model.contracts || []).filter((contract) => String(contract.language || '').toLowerCase() === key),
    modules: (model.modules || []).filter((module) => String(module.language || '').toLowerCase() === key),
    symbols: (model.symbols || []).filter((symbol) => String(symbol.language || '').toLowerCase() === key),
    dependencies: (model.dependencies || []).filter((dependency) => String(dependency.language || '').toLowerCase() === key),
    importantFiles: (model.importantFiles || []).filter((file) => (file.language ? String(file.language).toLowerCase() === key : allObservedFiles.has(file.file))),
    tests: {
      tests: (model.tests?.tests || []).filter((file) => allObservedFiles.has(file)),
      links: (model.tests?.links || []).filter((link) => allObservedFiles.has(link.implementation) || allObservedFiles.has(link.test))
    },
    graph: {
      nodes: (model.graph?.nodes || []).filter((node) => allowedNodeIds.has(node.id)),
      edges: (model.graph?.edges || []).filter((edge) => allowedNodeIds.has(edge.from) && allowedNodeIds.has(edge.to))
    }
  };

  if (!projected.discovery.languages.length) {
    projected.discovery.languages = [{ language: languageLabel(key), key, count: 0, percentage: 0 }];
  }
  return projected;
}

function saveModel(rootDir, model) {
  ensureArchieDir(rootDir);
  fs.writeFileSync(modelPath(rootDir), JSON.stringify(model, null, 2));
}

function loadModel(rootDir) {
  return readJsonIfExists(modelPath(rootDir));
}

function writeDefaultConfig(rootDir) {
  ensureArchieDir(rootDir);
  const config = {
    checks: {
      architecture: true,
      contracts: true,
      capabilities: true,
      dependencyDrift: true,
      runtimeReachability: true,
      evidenceRequirements: true,
      testExecution: true,
      performanceRegression: false,
      securityPolicy: false
    }
  };
  fs.writeFileSync(configPath(rootDir), JSON.stringify(config, null, 2));
  return config;
}

function generateWorkflowYaml() {
  return `name: Engineering Assurance
on:
  pull_request:
  push:
    branches:
      - main
permissions:
  contents: read
jobs:
  assurance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
      - name: Build system model
        run: npx participant analyze --ci
      - name: Check architecture
        run: npx participant check architecture
      - name: Check contracts
        run: npx participant check contracts
      - name: Check capability completeness
        run: npx participant check capabilities
      - name: Verify required evidence
        run: npx participant verify --changed
      - name: Generate assurance report
        run: npx participant report --format github
`;
}

function writeWorkflow(rootDir) {
  const workflowPath = path.join(rootDir, '.github', 'workflows', 'engineering-assurance.yml');
  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(workflowPath, generateWorkflowYaml());
  return workflowPath;
}

function listChangedFiles(rootDir) {
  try {
    const parts = [];
    for (const cmd of ['git diff --name-only', 'git diff --cached --name-only']) {
      const out = execSync(cmd, { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      parts.push(...out.split('\n').map((s) => s.trim()).filter(Boolean));
    }
    return Array.from(new Set(parts));
  } catch {
    return [];
  }
}

function computeImpact(model, changedFiles) {
  const changed = new Set(changedFiles || []);
  const affectedImportantFiles = model.importantFiles.filter((f) => changed.has(f.file));
  const contractsAffected = model.contracts.filter((c) => changed.has(c.file));
  const runtimeAffected = model.runtimes.filter((runtime) => {
    if (/python/i.test(runtime)) return [...changed].some((f) => /\.py$/.test(f) || /pyproject\.toml|requirements|setup\.py|setup\.cfg|pipfile/i.test(f));
    if (/worker/i.test(runtime)) return [...changed].some((f) => /worker|runtime/i.test(f));
    if (/browser/i.test(runtime)) return [...changed].some((f) => /ui|browser|react|web/i.test(f));
    if (/electron/i.test(runtime)) return [...changed].some((f) => /electron|desktop/i.test(f));
    return [...changed].some((f) => /server|node|runtime|manifest|index/i.test(f));
  });

  const evidence = {
    contract: contractsAffected.length ? 'requires revalidation' : 'valid',
    runtime: runtimeAffected.length ? 'requires revalidation' : 'valid',
    endToEnd: changed.size ? 'requires revalidation' : 'valid'
  };

  return {
    changedFiles: [...changed],
    affected: {
      capabilities: [...changed].filter((f) => /capability|feature|service/i.test(f)).length,
      runtimes: runtimeAffected,
      contracts: contractsAffected.map((c) => c.file),
      importantFiles: affectedImportantFiles.map((f) => f.file)
    },
    evidence,
    assuranceScore: Math.max(0, model.confidence - (runtimeAffected.length * 7 + contractsAffected.length * 4 + changed.size))
  };
}

function checkModel(model, kind) {
  if (!model) return { ok: false, issues: ['No system model found. Run analyze first.'] };
  if (kind === 'architecture') {
    const issues = [];
    if (!model.runtimes.length) issues.push('No runtimes detected');
    if (model.uncertainties?.length) issues.push(...model.uncertainties);
    return { ok: issues.length === 0, issues };
  }
  if (kind === 'contracts') {
    const issues = [];
    if (!model.contracts.length) issues.push('No contracts detected');
    return { ok: issues.length === 0, issues };
  }
  if (kind === 'capabilities') {
    const caps = model.importantFiles.filter((f) => /capability|feature|service/i.test(f.file));
    const issues = caps.length ? [] : ['No capability files detected'];
    return { ok: issues.length === 0, issues };
  }
  return { ok: false, issues: [`Unknown check kind: ${kind}`] };
}

function verifyEvidence(model, changedFiles) {
  const impact = computeImpact(model, changedFiles);
  const missing = [];
  if (impact.evidence.runtime !== 'valid') missing.push('Runtime evidence requires revalidation');
  if (impact.evidence.endToEnd !== 'valid') missing.push('End-to-end evidence requires revalidation');
  return { ok: missing.length === 0, missing, impact };
}

function githubReport(model, impact, verification) {
  return [
    '## ENGINEERING ASSURANCE',
    '',
    `**Assurance score:** ${impact.assuranceScore}%`,
    '',
    '### Product alignment',
    `- ${model.discovery.applications.length ? '✓' : '!'} Repository structure analyzed`,
    '',
    '### Architecture',
    `- ${impact.affected.runtimes.length ? '!' : '✓'} Runtime impact: ${impact.affected.runtimes.join(', ') || 'None'}`,
    '',
    '### Contracts',
    `- ${impact.affected.contracts.length ? '!' : '✓'} Contracts changed: ${impact.affected.contracts.length}`,
    '',
    '### Evidence',
    `- Contract evidence: ${impact.evidence.contract}`,
    `- Runtime evidence: ${impact.evidence.runtime}`,
    `- End-to-end evidence: ${impact.evidence.endToEnd}`,
    '',
    verification.ok ? '**Result:** PASS' : '**Result:** PASS WITH OBSERVATION'
  ].join('\n');
}

module.exports = {
  buildModel,
  saveModel,
  loadModel,
  writeDefaultConfig,
  writeWorkflow,
  generateWorkflowYaml,
  listChangedFiles,
  computeImpact,
  checkModel,
  verifyEvidence,
  githubReport,
  modelPath,
  loadDecisions,
  confirmUnderstanding,
  correctArchitecture,
  projectModelByLanguage
};
