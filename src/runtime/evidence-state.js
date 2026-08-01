const EVIDENCE_STATUSES = new Set(['valid', 'stale', 'missing', 'running', 'failed', 'superseded']);

function buildInitialEvidenceState(model) {
  const evidence = [];
  evidence.push({ id: 'end-to-end-suite', status: 'valid', type: 'end-to-end', updated_at: new Date().toISOString(), reason: null });

  for (const runtime of model.runtimes || []) {
    evidence.push({
      id: `runtime-execution-${runtime.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      status: 'valid',
      type: 'runtime-execution',
      runtime,
      updated_at: new Date().toISOString(),
      reason: null
    });
  }

  for (const contract of model.contracts || []) {
    evidence.push({
      id: `contract-compatibility-${contract.file.replace(/[^a-z0-9]+/gi, '-')}`,
      status: 'valid',
      type: 'contract-compatibility',
      contract: contract.file,
      updated_at: new Date().toISOString(),
      reason: null
    });
  }

  return evidence;
}

function summarizeEvidence(evidenceState) {
  const summary = {
    valid: 0,
    stale: 0,
    missing: 0,
    running: 0,
    failed: 0,
    superseded: 0
  };
  for (const evidence of evidenceState) {
    const status = EVIDENCE_STATUSES.has(evidence.status) ? evidence.status : 'missing';
    summary[status] += 1;
  }
  return summary;
}

function invalidateEvidenceForChanges(evidenceState, changedFiles, modelVersion) {
  const files = changedFiles || [];
  const invalidated = [];

  for (const evidence of evidenceState) {
    let reasonType = null;
    if (evidence.type === 'end-to-end' && files.length) reasonType = 'implementation_changed';
    if (evidence.type === 'runtime-execution' && files.some((file) => /runtime|worker/i.test(file))) reasonType = 'execution_path_changed';
    if (evidence.type === 'contract-compatibility' && files.some((file) => /contract|schema|manifest|types?/i.test(file))) reasonType = 'contract_changed';

    if (!reasonType || evidence.status === 'stale') continue;

    const reason = {
      type: reasonType,
      files,
      model_version: modelVersion
    };

    invalidated.push({
      evidence_id: evidence.id,
      previous_status: evidence.status,
      status: 'stale',
      reason
    });

    evidence.status = 'stale';
    evidence.reason = reason;
    evidence.updated_at = new Date().toISOString();
  }

  return invalidated;
}

module.exports = {
  buildInitialEvidenceState,
  summarizeEvidence,
  invalidateEvidenceForChanges
};
