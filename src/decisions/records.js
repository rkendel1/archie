const crypto = require('node:crypto');
const { normalizeAlternatives } = require('./alternatives');
const { summarizeRationale } = require('./rationale');

class DecisionRegistry {
  constructor() {
    this.records = [];
  }

  create(input = {}) {
    const timestamp = new Date().toISOString();
    const record = {
      id: input.id || `decision_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      projectId: input.projectId || 'default-project',
      changeId: input.changeId || null,
      title: String(input.title || 'Engineering decision').trim(),
      decision: String(input.decision || '').trim(),
      rationale: summarizeRationale(input),
      alternatives: normalizeAlternatives(input.alternatives),
      participants: unique(input.participants),
      evidence: unique(input.evidence),
      affectedSystem: {
        capabilities: unique(input.affectedSystem?.capabilities),
        runtimes: unique(input.affectedSystem?.runtimes),
        contracts: unique(input.affectedSystem?.contracts),
        files: unique(input.affectedSystem?.files)
      },
      status: normalizeStatus(input.status || 'proposed'),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.records.push(record);
    return record;
  }

  list(projectId = null) {
    if (!projectId) return [...this.records];
    return this.records.filter((record) => record.projectId === projectId);
  }

  updateStatus(id, status) {
    const record = this.records.find((entry) => entry.id === id);
    if (!record) return null;
    record.status = normalizeStatus(status);
    record.updatedAt = new Date().toISOString();
    return record;
  }
}

function unique(value = []) {
  return Array.from(new Set((Array.isArray(value) ? value : []).map((entry) => String(entry).trim()).filter(Boolean)));
}

function normalizeStatus(value) {
  const allowed = new Set(['proposed', 'accepted', 'superseded', 'rejected']);
  return allowed.has(value) ? value : 'proposed';
}

module.exports = {
  DecisionRegistry
};
