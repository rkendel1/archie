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
    agent_session_id: null,
    declared_files: [],
    unexpected_files: [],
    plans: [],
    implementation_reports: [],
    evidence_reports: [],
    required_evidence: [],
    verification: null,
    completion: null,
    change_proposal: null,
    interventions: [],
    intervention_summary: { open: 0, high: 0, medium: 0, low: 0 },
    constraints: [],
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
  if (Array.isArray(update.declaredFiles)) session.declared_files = Array.from(new Set(update.declaredFiles)).sort();
  if (Array.isArray(update.unexpectedFiles)) session.unexpected_files = Array.from(new Set(update.unexpectedFiles)).sort();
  if (Array.isArray(update.constraints)) session.constraints = update.constraints;
  if (Array.isArray(update.requiredEvidence)) session.required_evidence = Array.from(new Set(update.requiredEvidence));
  if (update.verification) session.verification = update.verification;
  if (update.completion) session.completion = update.completion;
  if (update.changeProposal) session.change_proposal = update.changeProposal;
  if (Array.isArray(update.interventions)) session.interventions = update.interventions;
  if (update.interventionSummary) session.intervention_summary = update.interventionSummary;
  session.updated_at = new Date().toISOString();
  return session;
}

function setSessionIntent(session, intent) {
  session.intent = makeIntent(intent);
  if (session.intent.status === 'explicit') session.intent.status = 'declared';
  session.updated_at = new Date().toISOString();
  return session;
}

function bindAgentSession(session, agentSessionId) {
  session.agent_session_id = agentSessionId || null;
  session.updated_at = new Date().toISOString();
  return session;
}

function addPlan(session, plan) {
  session.plans.push(plan);
  session.updated_at = new Date().toISOString();
  return session;
}

function getPlan(session, planId) {
  return session.plans.find((plan) => plan.id === planId) || null;
}

function addImplementationReport(session, report) {
  session.implementation_reports.push(report);
  session.updated_at = new Date().toISOString();
  return session;
}

function addEvidenceReport(session, report) {
  session.evidence_reports.push(report);
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
  bindAgentSession,
  addPlan,
  getPlan,
  addImplementationReport,
  addEvidenceReport,
  completeChangeSession,
  abandonChangeSession
};
