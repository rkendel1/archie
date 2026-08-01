const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  buildModel,
  saveModel,
  writeWorkflow,
  loadModel,
  confirmUnderstanding,
  correctArchitecture
} = require('../src/model');

function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'archie-mvp-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({
    name: 'fixture',
    main: 'src/index.js',
    dependencies: { react: '^19.0.0' }
  }, null, 2));
  fs.writeFileSync(path.join(repo, 'src', 'runtime-manifest.ts'), 'export interface RuntimeContract { v: number }\n');
  fs.writeFileSync(path.join(repo, 'src', 'capability-registry.ts'), 'export const capabilities = []\n');
  fs.writeFileSync(path.join(repo, 'src', 'analytics-worker.rs'), 'fn main() {}\n');
  fs.writeFileSync(path.join(repo, 'src', 'index.js'), 'require("./capability-registry")\n');
  return repo;
}

test('buildModel discovers runtimes/contracts/important files', () => {
  const repo = makeRepo();
  const model = buildModel(repo);
  saveModel(repo, model);

  assert.ok(model.runtimes.includes('Node Development Runtime'));
  assert.ok(model.runtimes.includes('Browser Runtime'));
  assert.ok(model.runtimes.includes('WASM Worker Runtime'));
  assert.ok(model.contracts.some((c) => c.file.includes('runtime-manifest.ts')));
  assert.ok(model.importantFiles.length > 0);
  assert.ok(loadModel(repo));
});

test('workflow generation creates engineering assurance workflow', () => {
  const repo = makeRepo();
  const workflowPath = writeWorkflow(repo);
  const yaml = fs.readFileSync(workflowPath, 'utf8');

  assert.ok(yaml.includes('name: Engineering Assurance'));
  assert.ok(yaml.includes('participant check architecture'));
  assert.ok(yaml.includes('participant verify --changed'));
});

test('confirm/correct architecture decisions persist and apply', () => {
  const repo = makeRepo();
  confirmUnderstanding(repo);
  correctArchitecture(repo, 'Use Worker Runtime for analytics capability');

  const model = buildModel(repo);
  assert.equal(model.systemStatus, 'pending-review');
  assert.ok(model.userDecisions.architectureCorrections.includes('Use Worker Runtime for analytics capability'));
  assert.ok(model.architecture.some((layer) => layer.layer === 'User Corrections'));
});

test('buildModel includes python analyzer output in shared model', () => {
  const repo = makeRepo();
  fs.mkdirSync(path.join(repo, 'services', 'analytics'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'pyproject.toml'), '[project]\nname = "fixture-python"\n');
  fs.writeFileSync(path.join(repo, 'requirements.txt'), 'fastapi==0.111.0\npydantic==2.8.0\n');
  fs.writeFileSync(path.join(repo, 'services', 'analytics', 'app.py'), [
    'from fastapi import FastAPI',
    'from pydantic import BaseModel',
    '',
    'app = FastAPI()',
    '',
    'class DatasetInsightResult(BaseModel):',
    '  confidence: float',
    '',
    '@app.get("/insight")',
    'def insight() -> DatasetInsightResult:',
    '  return DatasetInsightResult(confidence=0.9)'
  ].join('\n'));

  const model = buildModel(repo);
  assert.ok(model.analyzers.some((analyzer) => analyzer.id === 'archie-python'));
  assert.ok(model.discovery.languages.some((language) => language.key === 'python'));
  assert.ok(model.modules.some((module) => module.id.includes('module:python:services.analytics.app')));
  assert.ok(model.runtimes.some((runtime) => runtime.includes('Python')));
  assert.ok(model.contracts.some((contract) => contract.language === 'python'));
});
