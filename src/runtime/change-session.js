const crypto = require('node:crypto');

function makeIntent(intent) {
  const description = String(intent || '').trim();
  if (!description) {
    return { status: 'unknown', description: null, confidence: 0 };
  }
  return { status: 'explicit', description, confidence: 1 };
}

function createChangeSession(intent) {
  return {
    id: `change_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    status: 'active',
    intent: makeIntent(intent),
    files: [],
    system_impact: {
      capabilities: 0,
      runtimes: 0,
      contracts: 0,
      important_files: 0
    },
    evidence: {
      valid: 0,
      stale: 0,
      missing: 0,
      running: 0,
      failed: 0,
      superseded: 0
    },
    assurance: {
      score: 0,
      status: 'in_progress'
    },
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null
  };
}

function updateChangeSession(session, update = {}) {
  const files = new Set(session.files);
  for (const file of update.files || []) files.add(file);

  session.files = Array.from(files).sort();
  if (update.systemImpact) session.system_impact = update.systemImpact;
  if (update.evidence) session.evidence = update.evidence;
  if (update.assurance) session.assurance = update.assurance;
  session.updated_at = new Date().toISOString();
  return session;
}

function setSessionIntent(session, intent) {
  session.intent = makeIntent(intent);
  session.updated_at = new Date().toISOString();
  return session;
}

function completeChangeSession(session) {
  session.status = 'completed';
  session.assurance.status = 'completed';
  session.completed_at = new Date().toISOString();
  session.updated_at = session.completed_at;
  return session;
}

function abandonChangeSession(session) {
  session.status = 'abandoned';
  session.assurance.status = 'abandoned';
  session.completed_at = new Date().toISOString();
  session.updated_at = session.completed_at;
  return session;
}

module.exports = {
  createChangeSession,
  updateChangeSession,
  setSessionIntent,
  completeChangeSession,
  abandonChangeSession
};
