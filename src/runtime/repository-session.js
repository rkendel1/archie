const fs = require('node:fs');
const path = require('node:path');
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
    this.activeChangeSession = null;
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
