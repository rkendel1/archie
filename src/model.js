const fs = require('node:fs');
const path = require('node:path');

const MODEL_DIR = '.archie';
const MODEL_FILE = 'system-model.json';
const CONFIG_FILE = 'config.json';

function walkFiles(rootDir, out = [], depth = 0) {
  if (depth > 8) return out;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name.startsWith('.archie-cache')) continue;
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, out, depth + 1);
    } else {
      out.push(abs);
    }
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

function discoverFrameworks(root) {
  const pkg = readJsonIfExists(path.join(root, 'package.json')) || {};
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {})
  };
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
      for (const [name, cmd] of Object.entries(pkg.scripts)) {
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
  if (lowerFiles.some((f) => f.includes('worker'))) {
    runtimes.add('WASM Worker Runtime');
  }
  if (frameworks.some((f) => f.name === 'react' || f.name === 'next') || lowerFiles.some((f) => f.includes('browser'))) {
    runtimes.add('Browser Runtime');
  }
  return Array.from(runtimes);
}

function extractContracts(root, files) {
  const contracts = [];
  for (const abs of files) {
    const file = rel(root, abs);
    if (!/\.(ts|tsx|js|json)$/i.test(file)) continue;
    const basename = path.basename(file).toLowerCase();
    if (/(contract|schema|manifest|types?)/.test(basename)) {
      contracts.push({ file, confidence: 0.9, reason: 'filename-pattern' });
      continue;
    }
    if (!/\.(ts|tsx|js)$/i.test(file)) continue;
    const content = fs.readFileSync(abs, 'utf8');
    if (/\b(interface|type)\s+[A-Z]/.test(content) || /zod|yup|ajv/.test(content)) {
      contracts.push({ file, confidence: 0.7, reason: 'source-pattern' });
    }
  }
  return contracts;
}

function mapTests(root, files) {
  const tests = files.filter((f) => /(\.test\.|\.spec\.|__tests__)/.test(path.basename(f))).map((f) => rel(root, f));
  const map = [];
  for (const testFile of tests) {
    const base = testFile.replace(/(\.test|\.spec)\.[^.]+$/, '').replace(/__tests__\//, '');
    const impl = files
      .map((f) => rel(root, f))
      .find((f) => f.includes(base) && !f.includes(testFile));
    if (impl) map.push({ test: testFile, implementation: impl });
  }
  return { tests, links: map };
}

function scoreFileImportance(root, files, contracts, testLinks) {
  const linkedTests = new Map();
  for (const link of testLinks) {
    linkedTests.set(link.implementation, (linkedTests.get(link.implementation) || 0) + 1);
  }
  const contractSet = new Set(contracts.map((c) => c.file));

  const rows = [];
  for (const abs of files) {
    const file = rel(root, abs);
    const content = fs.readFileSync(abs, 'utf8');
    const architectureAuthority = /(manifest|kernel|registry|runtime|planner)/i.test(file) ? 30 : 10;
    const runtimeReachability = /(index|main|app|server|worker|runtime)/i.test(file) ? 20 : 5;
    const dependencyCentrality = Math.min((content.match(/\b(import|require\()/g) || []).length, 15);
    const contractOwnership = contractSet.has(file) ? 15 : 0;
    const capabilityImpact = /(capability|feature|service)/i.test(file) ? 10 : 3;
    const changeFrequency = 5;
    const failureImpact = linkedTests.has(file) ? 5 : 2;
    const score = architectureAuthority + runtimeReachability + dependencyCentrality + contractOwnership + capabilityImpact + changeFrequency + failureImpact;
    rows.push({
      file,
      score,
      signals: {
        architectureAuthority,
        runtimeReachability,
        dependencyCentrality,
        contractOwnership,
        capabilityImpact,
        changeFrequency,
        failureImpact
      }
    });
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, 25);
}

function buildGraph(model) {
  const nodes = [];
  const edges = [];

  nodes.push({ id: 'product-intent', type: 'product-intent', label: 'Product Intent' });

  for (const runtime of model.runtimes) {
    const id = `runtime:${runtime}`;
    nodes.push({ id, type: 'runtime', label: runtime });
    edges.push({ from: 'product-intent', to: id, type: 'supports' });
  }

  for (const c of model.contracts) {
    const id = `contract:${c.file}`;
    nodes.push({ id, type: 'contract', label: c.file });
    for (const runtime of model.runtimes) {
      edges.push({ from: `runtime:${runtime}`, to: id, type: 'uses' });
    }
  }

  for (const f of model.importantFiles) {
    const id = `file:${f.file}`;
    nodes.push({ id, type: 'implementation', label: f.file, importance: f.score });
    if (/(capability|service)/i.test(f.file)) {
      edges.push({ from: 'product-intent', to: id, type: 'capability' });
    }
  }

  return { nodes, edges };
}

function inferArchitecture(model) {
  const architecture = [];
  architecture.push({ layer: 'Product Intent', summary: 'Repository-level outcomes are inferred from runtime/capability markers.' });
  architecture.push({ layer: 'Runtimes', summary: `${model.runtimes.join(' · ')}` });
  architecture.push({ layer: 'Contracts', summary: `${model.contracts.length} contract candidates detected` });
  architecture.push({ layer: 'Implementation', summary: `${model.importantFiles.length} important files ranked` });
  architecture.push({ layer: 'Evidence', summary: `${model.tests.tests.length} tests mapped` });
  return architecture;
}

function findUncertainties(model) {
  const out = [];
  if (model.runtimes.includes('Browser Runtime') && model.runtimes.includes('Electron Desktop Host')) {
    out.push('Browser and Electron session ownership is ambiguous');
  }
  if (model.contracts.length === 0) {
    out.push('No explicit contracts detected. Review contract detection patterns.');
  }
  if (model.tests.tests.length === 0) {
    out.push('No test evidence linked to implementation.');
  }
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

function buildModel(rootDir) {
  const absRoot = path.resolve(rootDir);
  const filesAbs = walkFiles(absRoot);
  const files = filesAbs.map((f) => rel(absRoot, f));
  const frameworks = discoverFrameworks(absRoot);
  const entryPoints = identifyEntryPoints(absRoot);
  const contracts = extractContracts(absRoot, filesAbs);
  const tests = mapTests(absRoot, filesAbs);
  const runtimes = detectRuntimes(absRoot, filesAbs, frameworks);
  const importantFiles = scoreFileImportance(absRoot, filesAbs, contracts, tests.links);

  const model = {
    generatedAt: new Date().toISOString(),
    root: absRoot,
    discovery: {
      languages: discoverLanguages(files),
      frameworks,
      entryPoints,
      applications: files.filter((f) => /app|service|api|worker|desktop/i.test(f)).slice(0, 50),
      dependencies: readJsonIfExists(path.join(absRoot, 'package.json'))?.dependencies || {}
    },
    runtimes,
    contracts,
    tests,
    importantFiles
  };

  model.graph = buildGraph(model);
  model.architecture = inferArchitecture(model);
  model.uncertainties = findUncertainties(model);
  model.confidence = confidence(model);

  return model;
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
  const { execSync } = require('node:child_process');
  try {
    const raw = execSync('git diff --name-only', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return raw.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function computeImpact(model, changedFiles) {
  const changed = new Set(changedFiles || []);
  const affectedImportantFiles = model.importantFiles.filter((f) => changed.has(f.file));
  const contractsAffected = model.contracts.filter((c) => changed.has(c.file));
  const runtimeAffected = model.runtimes.filter((runtime) => {
    if (/worker/i.test(runtime)) return [...changed].some((f) => /worker/i.test(f));
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
    if (model.uncertainties.length) issues.push(...model.uncertainties);
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
  listChangedFiles,
  computeImpact,
  checkModel,
  verifyEvidence,
  githubReport,
  modelPath
};
