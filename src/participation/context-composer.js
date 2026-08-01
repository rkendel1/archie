const { selectContext } = require('./context-selector');
const { buildConstraints } = require('./constraint-engine');

function composeContext({ repositoryId, modelVersion, model, intent, detail = 'focused' }) {
  const selected = selectContext(model, detail);
  const constraints = buildConstraints(model, intent);
  return {
    context_version: '1.0',
    repository: {
      name: repositoryId,
      model_version: modelVersion
    },
    intent: {
      status: intent?.status || 'declared',
      confidence: Number(intent?.confidence || 0)
    },
    system: {
      architecture: selected.architecture.map((entry) => ({
        name: entry.layer || entry.name,
        status: 'confirmed',
        source: 'model',
        confidence: 0.8,
        authority: 'observed',
        last_updated: new Date().toISOString(),
        model_version: modelVersion
      })),
      runtimes: selected.runtimes.map((runtime) => ({
        id: runtime.toLowerCase().replace(/\s+/g, '-'),
        role: runtime,
        authority: 'confirmed',
        source: 'model',
        status: 'observed',
        confidence: 0.8,
        last_updated: new Date().toISOString(),
        model_version: modelVersion
      }))
    },
    reusable_capabilities: selected.capabilities,
    constraints: constraints.map((constraint) => ({
      ...constraint,
      source: constraint.source,
      status: 'observed',
      last_updated: new Date().toISOString(),
      model_version: modelVersion
    })),
    important_files: selected.importantFiles.map((entry) => ({
      path: entry.file,
      role: 'Important implementation authority',
      importance: entry.score,
      source: 'model',
      status: 'observed',
      confidence: 0.8,
      authority: 'ranked',
      last_updated: new Date().toISOString(),
      model_version: modelVersion
    })),
    contracts: selected.contracts.map((contract) => ({
      name: contract.name || contract.file,
      status: 'observed',
      consumers: 0,
      source: contract.file,
      confidence: contract.confidence || 0.7,
      authority: contract.reason || 'observed',
      last_updated: new Date().toISOString(),
      model_version: modelVersion
    })),
    required_evidence: buildRequiredEvidence(selected, constraints),
    uncertainties: selected.uncertainties.map((statement) => ({
      statement,
      confidence: 0.64,
      source: 'model',
      status: 'inferred',
      authority: 'heuristic',
      last_updated: new Date().toISOString(),
      model_version: modelVersion
    }))
  };
}

function buildRequiredEvidence(selected, constraints) {
  const required = new Set(['capability-contract', 'end-to-end-dataset-workflow']);
  if (selected.runtimes.length) required.add('runtime-registration');
  if (selected.contracts.length) required.add('contract-compatibility');
  if (constraints.some((constraint) => constraint.domain === 'runtime')) required.add('runtime-authority-validation');
  return Array.from(required);
}

module.exports = {
  composeContext
};
