const fs = require('node:fs');
const path = require('node:path');
const { AgentRegistry } = require('../agents/agent-registry');
const { mapEventType } = require('../agents/agent-events');
const { protocolDescriptor } = require('../protocols/agent-protocol');
const { understandIntent } = require('../participation/intent-service');
const { composeContext } = require('../participation/context-composer');
const { submitPlan } = require('../participation/plan-service');
const { evaluateDeclaredFiles } = require('../participation/change-coordinator');
const { observeImplementation } = require('../participation/implementation-observer');
const { classifyEvidence } = require('../participation/evidence-coordinator');
const { reviewCompletion } = require('../participation/completion-engine');
const {
  buildModel,
  saveModel,
  computeImpact,
  verifyEvidence
} = require('../model');
const { RuntimeEventBus } = require('./event-bus');
const {
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
} = require('./change-session');
const {
  buildInitialEvidenceState,
  summarizeEvidence,
  invalidateEvidenceForChanges
} = require('./evidence-state');
const { computeGraphDelta } = require('./graph-updater');
const { analyzeChange } = require('./incremental-analyzer');

class RepositorySession {
  constructor(rootDir) {
    this.rootDir = path.resolve(rootDir);
    this.repositoryId = path.basename(this.rootDir);
    this.model = null;
    this.modelVersion = 0;
    this.previousVersion = null;
    this.updatedAt = null;
    this.eventBus = new RuntimeEventBus(this.repositoryId);
    this.agentRegistry = new AgentRegistry(this.repositoryId);
    this.activeChangeSession = null;
    this.changeSessions = new Map();
    this.evidenceState = [];
    this.assurance = { score: 0, status: 'in_progress' };
    this.watcher = null;
    this.pendingFiles = new Set();
    this.flushTimer = null;
  }

  initialize() {
    this.eventBus.publish('session.opened', { root: this.rootDir }, { modelVersion: this.modelVersion });
    this.eventBus.publish('analysis.started', { mode: 'initial' }, { modelVersion: this.modelVersion });

    this.model = buildModel(this.rootDir);
    saveModel(this.rootDir, this.model);
    this.previousVersion = this.modelVersion;
    this.modelVersion += 1;
    this.updatedAt = new Date().toISOString();
    this.evidenceState = buildInitialEvidenceState(this.model);
    this.assurance = this.computeAssurance(this.model.confidence, this.evidenceState);

    this.eventBus.publish('model.initialized', {
      repository_id: this.repositoryId,
      previous_version: this.previousVersion,
      updated_at: this.updatedAt
    }, { modelVersion: this.modelVersion });
    this.eventBus.publish('assurance.updated', this.assurance, { modelVersion: this.modelVersion });

    return this.snapshot();
  }

  startWatching() {
    if (this.watcher) return;
    this.watcher = fs.watch(this.rootDir, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      const normalized = String(filename).replace(/\\/g, '/');
      if (normalized.startsWith('.git/') || normalized.startsWith('node_modules/')) return;
      this.pendingFiles.add(normalized);
      if (this.flushTimer) clearTimeout(this.flushTimer);
      this.flushTimer = setTimeout(() => {
        const files = Array.from(this.pendingFiles);
        this.pendingFiles.clear();
        this.processRepositoryChange(files, { source: 'watcher' });
      }, 120);
    });
  }

  stopWatching() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.watcher) return;
    this.watcher.close();
    this.watcher = null;
  }

  startChangeSession(intent) {
    this.activeChangeSession = createChangeSession(intent);
    this.changeSessions.set(this.activeChangeSession.id, this.activeChangeSession);
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  setActiveSessionIntent(id, intent) {
    if (!this.activeChangeSession || this.activeChangeSession.id !== id) return null;
    setSessionIntent(this.activeChangeSession, intent);
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  completeActiveSession() {
    if (!this.activeChangeSession) return null;
    completeChangeSession(this.activeChangeSession);
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  abandonActiveSession() {
    if (!this.activeChangeSession) return null;
    abandonChangeSession(this.activeChangeSession);
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  processRepositoryChange(changedFiles = [], options = {}) {
    if (!changedFiles.length) return this.snapshot();

    if (!this.activeChangeSession || this.activeChangeSession.status !== 'active') {
      this.startChangeSession();
    }

    this.eventBus.publish('repository.change.detected', {
      files: changedFiles,
      source: options.source || 'manual'
    }, this.eventContext());

    this.eventBus.publish('analysis.started', { mode: 'change', files: changedFiles }, this.eventContext());

    const previousModel = this.model;
    const analysis = analyzeChange(this.rootDir, changedFiles);
    const nextModel = analysis.model;
    saveModel(this.rootDir, nextModel);

    const previousVersion = this.modelVersion;
    this.previousVersion = previousVersion;
    this.modelVersion += 1;
    this.updatedAt = new Date().toISOString();
    this.model = nextModel;

    const delta = computeGraphDelta(previousModel?.graph, nextModel.graph);
    const impact = computeImpact(nextModel, changedFiles);
    const invalidated = invalidateEvidenceForChanges(this.evidenceState, changedFiles, this.modelVersion);
    this.assurance = this.computeAssurance(impact.assuranceScore, this.evidenceState);

    const evidenceSummary = summarizeEvidence(this.evidenceState);
    updateChangeSession(this.activeChangeSession, {
      files: changedFiles,
      systemImpact: {
        capabilities: impact.affected.capabilities,
        runtimes: impact.affected.runtimes.length,
        contracts: impact.affected.contracts.length,
        important_files: impact.affected.importantFiles.length
      },
      evidence: evidenceSummary,
      assurance: this.assurance
    });
    const declaration = evaluateDeclaredFiles({
      declaredFiles: this.activeChangeSession.declared_files,
      observedFiles: this.activeChangeSession.files
    });
    updateChangeSession(this.activeChangeSession, {
      declaredFiles: declaration.declared_files,
      unexpectedFiles: declaration.unexpected_files
    });

    this.eventBus.publish('analysis.completed', {
      mode: analysis.mode,
      fallback_reason: analysis.fallback_reason
    }, this.eventContext());

    this.eventBus.publish('graph.updated', {
      previous_version: previousVersion,
      model_version: this.modelVersion,
      delta,
      changed_files: changedFiles
    }, this.eventContext());

    if (impact.affected.runtimes.length) {
      this.eventBus.publish('architecture.changed', {
        affected_runtimes: impact.affected.runtimes,
        changed_files: changedFiles
      }, this.eventContext());
    }

    if (impact.affected.contracts.length) {
      this.eventBus.publish('contract.changed', {
        affected_contracts: impact.affected.contracts,
        changed_files: changedFiles
      }, this.eventContext());
    }

    this.eventBus.publish('impact.updated', impact, this.eventContext());

    for (const evidence of invalidated) {
      this.eventBus.publish('evidence.invalidated', {
        ...evidence,
        affected_files: evidence.reason.files
      }, this.eventContext());
    }

    this.eventBus.publish('assurance.updated', this.assurance, this.eventContext());
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());

    return {
      model_version: this.modelVersion,
      previous_version: previousVersion,
      updated_at: this.updatedAt,
      change_session_id: this.activeChangeSession.id,
      delta,
      impact,
      assurance: this.assurance,
      evidence: evidenceSummary,
      analysis: {
        mode: analysis.mode,
        fallback_reason: analysis.fallback_reason
      }
    };
  }

  rescan() {
    const model = buildModel(this.rootDir);
    saveModel(this.rootDir, model);
    const previousVersion = this.modelVersion;
    const delta = computeGraphDelta(this.model?.graph, model.graph);

    this.model = model;
    this.previousVersion = previousVersion;
    this.modelVersion += 1;
    this.updatedAt = new Date().toISOString();
    this.evidenceState = buildInitialEvidenceState(model);
    this.assurance = this.computeAssurance(model.confidence, this.evidenceState);

    this.eventBus.publish('graph.updated', {
      previous_version: previousVersion,
      model_version: this.modelVersion,
      delta,
      changed_files: []
    }, this.eventContext());

    this.eventBus.publish('assurance.updated', this.assurance, this.eventContext());

    return this.snapshot();
  }

  verifyActiveEvidence() {
    const changedFiles = this.activeChangeSession?.files || [];
    return verifyEvidence(this.model, changedFiles);
  }

  discoverAgentParticipation() {
    return protocolDescriptor(this.repositoryId, this.modelVersion);
  }

  registerAgent(input = {}) {
    const session = this.agentRegistry.register(input);
    this.eventBus.publish('agent.session.created', session, this.eventContext());
    return session;
  }

  getAgentSession(sessionId) {
    return this.agentRegistry.get(sessionId);
  }

  ensureAgentChangeSession(sessionId) {
    const agentSession = this.getAgentSession(sessionId);
    if (!agentSession) return null;
    if (!this.activeChangeSession || this.activeChangeSession.status !== 'active') {
      this.startChangeSession();
    }
    bindAgentSession(this.activeChangeSession, sessionId);
    return this.activeChangeSession;
  }

  submitAgentIntent(sessionId, intentInput = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const understood = understandIntent(intentInput, this.model);
    setSessionIntent(session, understood.outcome || intentInput.outcome || '');
    session.intent = { ...session.intent, ...understood };
    this.eventBus.publish('agent.intent.declared', { session_id: session.id, intent: session.intent }, this.eventContext());
    return session;
  }

  getAgentContext(sessionId, options = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const context = composeContext({
      repositoryId: this.repositoryId,
      modelVersion: this.modelVersion,
      model: this.model,
      intent: session.intent,
      detail: options.detail || 'focused'
    });
    updateChangeSession(session, {
      constraints: context.constraints,
      requiredEvidence: context.required_evidence
    });
    this.eventBus.publish('agent.context.updated', { session_id: session.id, context }, this.eventContext());
    return context;
  }

  submitAgentPlan(sessionId, planInput = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const context = this.getAgentContext(sessionId, { detail: planInput.detail || 'focused' });
    const plan = submitPlan(planInput, context);
    addPlan(session, plan);
    this.eventBus.publish('agent.plan.reviewed', {
      session_id: session.id,
      plan_id: plan.id,
      review: plan.review
    }, this.eventContext());
    return plan;
  }

  getAgentPlan(sessionId, planId) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    return getPlan(session, planId);
  }

  listAgentPlans(sessionId) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    return session.plans;
  }

  declareAgentFiles(sessionId, files = []) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    updateChangeSession(session, { declaredFiles: files });
    const declaration = evaluateDeclaredFiles({ declaredFiles: session.declared_files, observedFiles: session.files });
    updateChangeSession(session, { unexpectedFiles: declaration.unexpected_files });
    this.eventBus.publish('agent.change.observed', {
      session_id: session.id,
      declaration
    }, this.eventContext());
    return declaration;
  }

  submitImplementationReport(sessionId, input = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const report = observeImplementation(input, session.files);
    addImplementationReport(session, report);
    this.eventBus.publish('agent.change.observed', { session_id: session.id, implementation: report }, this.eventContext());
    return report;
  }

  submitEvidenceReport(sessionId, input = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const report = classifyEvidence(input, session.required_evidence || []);
    addEvidenceReport(session, report);
    this.eventBus.publish('agent.evidence.required', {
      session_id: session.id,
      evidence: report.classification
    }, this.eventContext());
    return report;
  }

  verifyAgentChange(sessionId) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const verification = this.verifyActiveEvidence();
    updateChangeSession(session, { verification });
    this.eventBus.publish('agent.verification.completed', {
      session_id: session.id,
      verification
    }, this.eventContext());
    return verification;
  }

  completeAgentChange(sessionId) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const verification = session.verification || this.verifyAgentChange(sessionId);
    const completion = reviewCompletion({ session, verification });
    updateChangeSession(session, { completion });
    const state = completion.result === 'ready_for_review' ? 'completed' : 'review_required';
    if (state === 'completed') completeChangeSession(session);
    else session.status = state;
    this.eventBus.publish('agent.completion.reviewed', {
      session_id: session.id,
      completion
    }, this.eventContext());
    return completion;
  }

  listAgentEvents(sessionId, sinceSequence = 0) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    return this.eventBus
      .list(sinceSequence)
      .filter((event) => !event.change_session_id || event.change_session_id === session.id)
      .map((event) => ({ ...event, type: mapEventType(event.type), agent_session_id: session.agent_session_id }));
  }

  getStatus() {
    return {
      repository: {
        id: this.repositoryId,
        root: this.rootDir
      },
      model: {
        version: this.modelVersion,
        previous_version: this.previousVersion,
        updated_at: this.updatedAt
      },
      repository_watch: this.watcher ? 'active' : 'inactive',
      active_change: this.activeChangeSession,
      assurance: this.assurance,
      evidence: summarizeEvidence(this.evidenceState)
    };
  }

  snapshot() {
    return {
      repository_id: this.repositoryId,
      model_version: this.modelVersion,
      previous_version: this.previousVersion,
      updated_at: this.updatedAt,
      model: this.model,
      change_session: this.activeChangeSession,
      evidence: summarizeEvidence(this.evidenceState),
      assurance: this.assurance
    };
  }

  eventContext() {
    return {
      modelVersion: this.modelVersion,
      changeSessionId: this.activeChangeSession?.id || null
    };
  }

  computeAssurance(baseScore, evidenceState) {
    const summary = summarizeEvidence(evidenceState);
    const penalty = summary.stale * 6 + summary.failed * 12 + summary.missing * 8;
    const score = Math.max(0, Math.min(100, Math.round(Number(baseScore || 0) - penalty)));
    return {
      score,
      status: summary.stale || summary.failed || summary.missing ? 'in_progress' : 'healthy'
    };
  }
}

module.exports = {
  RepositorySession
};
