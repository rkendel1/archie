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
const { createChangeProposal } = require('../protocols/change-proposal');
const { interventionEngine } = require('../intervention');
const { assembleChangeContext } = require('../context');
const {
  buildModel,
  saveModel,
  computeImpact,
  verifyEvidence
} = require('../model');
const { RuntimeEventBus } = require('./event-bus');
const { BuzzAdapter } = require('../integrations/buzz-adapter');
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
const {
  ControlPlaneState,
  runControlPlane,
  evaluateChangeTransition,
  evaluateCompletionDecision
} = require('../control-plane');
const { CONTROL_PLANE_EVENTS } = require('../control-plane/events/event-types');
const { publishControlPlaneEvents } = require('../control-plane/events/publisher');
const { acknowledgeIntervention } = require('../control-plane/interventions/acknowledgement');
const { resolveIntervention, waiveIntervention } = require('../control-plane/interventions/resolution');
const { escalateIntervention } = require('../control-plane/interventions/escalation');
const { acknowledgeContext } = require('../control-plane/context/acknowledgements');
const { refreshParticipantContext } = require('../control-plane/context/refresh');
const { resolveCoordinationAction } = require('../control-plane/coordination/conflict-resolution');

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
    this.buzzAdapter = new BuzzAdapter({ repositoryId: this.repositoryId, repositoryPath: this.rootDir });
    this.activeChangeSession = null;
    this.changeSessions = new Map();
    this.evidenceState = [];
    this.assurance = { score: 0, status: 'in_progress' };
    this.watcher = null;
    this.pendingFiles = new Set();
    this.flushTimer = null;
    this.controlPlaneState = new ControlPlaneState();
    this.controlPlane = null;
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
    this.refreshControlPlane();

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
    const room = this.buzzAdapter.createOrAttachRoom(this.activeChangeSession.id);
    this.buzzAdapter.upsertParticipant(room.id, {
      id: 'participant-archie',
      identity: { type: 'archie', name: 'Archie', provider: 'archie-runtime' },
      role: 'system-intelligence-advisor',
      capabilities: ['repository-understanding', 'impact-analysis', 'interventions', 'evidence', 'assurance'],
      status: 'active'
    });
    this.buzzAdapter.upsertParticipant(room.id, {
      id: 'participant-engineering-owner',
      identity: { type: 'human', name: 'Engineering Owner' },
      role: 'engineering-owner',
      capabilities: ['intent', 'decisions', 'prioritization', 'tradeoffs'],
      status: 'active'
    });
    updateChangeSession(this.activeChangeSession, { changeRoom: room });
    this.changeSessions.set(this.activeChangeSession.id, this.activeChangeSession);
    this.refreshControlPlane();
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    this.eventBus.publish('change-room.updated', room, this.eventContext());
    return this.activeChangeSession;
  }

  setActiveSessionIntent(id, intent) {
    if (!this.activeChangeSession || this.activeChangeSession.id !== id) return null;
    setSessionIntent(this.activeChangeSession, intent);
    this.refreshControlPlane();
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  completeActiveSession() {
    if (!this.activeChangeSession) return null;
    completeChangeSession(this.activeChangeSession);
    if (this.activeChangeSession.change_room?.id) {
      const room = this.buzzAdapter.setRoomStatus(this.activeChangeSession.change_room.id, 'completed');
      updateChangeSession(this.activeChangeSession, { changeRoom: room });
    }
    this.refreshControlPlane();
    this.eventBus.publish('change-session.updated', this.activeChangeSession, this.eventContext());
    return this.activeChangeSession;
  }

  abandonActiveSession() {
    if (!this.activeChangeSession) return null;
    abandonChangeSession(this.activeChangeSession);
    if (this.activeChangeSession.change_room?.id) {
      const room = this.buzzAdapter.setRoomStatus(this.activeChangeSession.change_room.id, 'archived');
      updateChangeSession(this.activeChangeSession, { changeRoom: room });
    }
    this.refreshControlPlane();
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
    this.refreshInterventions(impact);
    this.refreshControlPlane();

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

  proposeChange(input = {}) {
    if (!this.activeChangeSession || this.activeChangeSession.status !== 'active') {
      this.startChangeSession(input.intent?.summary || input.intent || '');
    }
    const proposal = createChangeProposal(input, {
      sessionId: this.activeChangeSession.id,
      actorType: input.actor?.type || 'agent',
      actorId: input.actor?.id || this.activeChangeSession.agent_session_id || 'unknown',
      actorName: input.actor?.name
    });
    updateChangeSession(this.activeChangeSession, {
      declaredFiles: proposal.scope.declaredFiles,
      requiredEvidence: proposal.constraints.requiredEvidence,
      changeProposal: proposal
    });
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForActor(proposal.actor),
      kind: 'proposal',
      subject: { type: 'change', id: proposal.id },
      content: {
        summary: proposal.intent.summary || 'Proposed a change',
        structured: { proposal }
      }
    });
    this.eventBus.publish('change.proposed', { proposal }, this.eventContext());
    this.refreshControlPlane();
    return proposal;
  }

  reviewActiveChange() {
    if (!this.activeChangeSession) return null;
    const proposal = this.activeChangeSession.change_proposal || this.proposeChange({});
    const files = proposal.scope?.declaredFiles?.length ? proposal.scope.declaredFiles : this.activeChangeSession.files;
    const impact = computeImpact(this.model, files);
    const interventionResult = this.refreshInterventions(impact);
    const high = interventionResult.summary.high;
    proposal.status = high ? 'constrained' : 'approved';
    proposal.updatedAt = new Date().toISOString();
    updateChangeSession(this.activeChangeSession, { changeProposal: proposal });
    const orderedInterventions = interventionResult.interventions;
    const review = {
      proposal,
      status: proposal.status.toUpperCase(),
      confidence: Number((0.86 - high * 0.07).toFixed(2)),
      system_impact: {
        capabilities: impact.affected.capabilities || 0,
        runtimes: impact.affected.runtimes.length,
        contracts: impact.affected.contracts.length,
        important_files: impact.affected.importantFiles.length
      },
      required_constraints: this.activeChangeSession.constraints.map((entry) => entry.statement || entry).filter(Boolean),
      open_risks: orderedInterventions.slice(0, 5).map((item) => ({
        severity: item.severity.toUpperCase(),
        type: item.type,
        message: item.message
      })),
      suggested_implementation_order: buildImplementationOrder(impact, proposal),
      interventions: orderedInterventions
    };
    this.refreshControlPlane();
    this.eventBus.publish('change.reviewed', review, this.eventContext());
    return review;
  }

  getActiveGuidance() {
    if (!this.activeChangeSession) return null;
    return this.reviewActiveChange();
  }

  getChangeContext(changeId = null) {
    const session = this.activeChangeSession;
    if (!session) return null;
    if (changeId && session.id !== changeId && session.change_proposal?.id !== changeId) return null;
    const interventions = session.interventions || [];
    const proposal = session.change_proposal || createChangeProposal({}, { sessionId: session.id });
    return assembleChangeContext({ proposal, model: this.model, interventions });
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
    this.refreshControlPlane();

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

  refreshControlPlane() {
    this.controlPlane = runControlPlane({
      model: this.model,
      activeChangeSession: this.activeChangeSession,
      changeSessions: Array.from(this.changeSessions.values()),
      assurance: this.assurance,
      evidence: this.evidenceState,
      verification: this.activeChangeSession?.verification || null,
      architectureIntent: this.model?.userDecisions ? {
        runtimeRules: [],
        ownershipRules: [],
        decisions: this.model.userDecisions
      } : {},
      state: this.controlPlaneState,
      repositoryRevision: String(this.modelVersion || 0),
      previousRevision: String(this.previousVersion || 0)
    });
    this.controlPlaneState.setPolicyEvaluations(this.controlPlane.policy?.evaluations || []);
    this.controlPlaneState.setInterventions(this.controlPlane.interventions || []);
    this.controlPlaneState.setRequirements(this.controlPlane.requirements || []);
    this.controlPlaneState.setCoordinationActions(this.controlPlane.coordinationActions || []);
    this.controlPlaneState.setParticipantContexts(this.controlPlane.context?.participantSnapshots || []);
    this.controlPlaneState.setSnapshot(this.controlPlane);
    this.publishControlPlaneDerivedEvents(this.controlPlane);
    return this.controlPlane;
  }

  getControlPlaneSnapshot() {
    if (!this.controlPlane) this.refreshControlPlane();
    return this.controlPlane;
  }

  listWorkClaims(changeId = null) {
    return this.controlPlaneState.workClaims.list(changeId);
  }

  declareWorkClaim(input = {}) {
    const active = this.activeChangeSession || this.startChangeSession(input.intent || '');
    const claim = this.controlPlaneState.workClaims.declare({
      ...input,
      changeId: input.changeId || active.id
    });
    this.refreshControlPlane();
    this.eventBus.publish('coordination.work-claim.declared', { claim }, this.eventContext());
    return claim;
  }

  createDecision(input = {}) {
    const active = this.activeChangeSession || this.startChangeSession(input.title || '');
    const record = this.controlPlaneState.decisions.create({
      ...input,
      projectId: this.repositoryId,
      changeId: input.changeId || active.id
    });
    this.refreshControlPlane();
    this.eventBus.publish('decision.recorded', { decision: record }, this.eventContext());
    return record;
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
    const room = this.getActiveChangeRoom();
    if (room) {
      this.buzzAdapter.upsertParticipant(room.id, {
        id: `participant-${agentSession.agent_id}`,
        identity: {
          type: 'coding-agent',
          name: agentSession.name,
          provider: 'archie-agent-registry',
          instanceId: agentSession.session_id
        },
        role: 'implementation-advisor',
        capabilities: agentSession.capabilities,
        advisoryScope: {
          repositoryContext: {
            enabled: true,
            files: this.activeChangeSession.files
          }
        },
        status: 'active'
      });
      updateChangeSession(this.activeChangeSession, { changeRoom: this.buzzAdapter.getRoom(room.id) });
    }
    return this.activeChangeSession;
  }

  submitAgentIntent(sessionId, intentInput = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const understood = understandIntent(intentInput, this.model);
    setSessionIntent(session, understood.outcome || intentInput.outcome || '');
    session.intent = { ...session.intent, ...understood };
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForAgentSession(sessionId),
      kind: 'observation',
      subject: { type: 'change', id: session.id },
      content: {
        summary: session.intent.description || session.intent.outcome || 'Declared implementation intent',
        structured: { intent: session.intent }
      }
    });
    this.eventBus.publish('agent.intent.declared', { session_id: session.id, intent: session.intent }, this.eventContext());
    this.refreshControlPlane();
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
    this.refreshControlPlane();
    return context;
  }

  submitAgentPlan(sessionId, planInput = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const context = this.getAgentContext(sessionId, { detail: planInput.detail || 'focused' });
    const plan = submitPlan(planInput, context);
    addPlan(session, plan);
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForAgentSession(sessionId),
      kind: 'proposal',
      subject: { type: 'plan', id: plan.id },
      content: {
        summary: `Submitted implementation plan ${plan.id}`,
        structured: { plan }
      }
    });
    this.eventBus.publish('agent.plan.reviewed', {
      session_id: session.id,
      plan_id: plan.id,
      review: plan.review
    }, this.eventContext());
    this.refreshControlPlane();
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
    this.refreshControlPlane();
    return declaration;
  }

  submitImplementationReport(sessionId, input = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const report = observeImplementation(input, session.files);
    addImplementationReport(session, report);
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForAgentSession(sessionId),
      kind: 'implementation-update',
      subject: { type: 'file' },
      content: {
        summary: report.summary || 'Implementation updated',
        structured: { report }
      }
    });
    this.eventBus.publish('agent.change.observed', { session_id: session.id, implementation: report }, this.eventContext());
    this.refreshControlPlane();
    return report;
  }

  submitEvidenceReport(sessionId, input = {}) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const report = classifyEvidence(input, session.required_evidence || []);
    addEvidenceReport(session, report);
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForAgentSession(sessionId),
      kind: 'evidence',
      subject: { type: 'evidence' },
      content: {
        summary: 'Submitted evidence for change session',
        structured: { classification: report.classification }
      }
    });
    this.eventBus.publish('agent.evidence.required', {
      session_id: session.id,
      evidence: report.classification
    }, this.eventContext());
    this.refreshControlPlane();
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
    this.refreshControlPlane();
    return verification;
  }

  completeAgentChange(sessionId) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    const verification = session.verification || this.verifyAgentChange(sessionId);
    const completion = reviewCompletion({ session, verification });
    updateChangeSession(session, { completion });
    this.submitAdvisoryContribution({
      participantId: this.getParticipantIdForAgentSession(sessionId),
      kind: 'completion-opinion',
      subject: { type: 'verification' },
      content: {
        summary: `Completion assessment: ${completion.result}`,
        structured: { completion }
      }
    });
    const state = completion.result === 'ready_for_review' ? 'completed' : 'review_required';
    if (state === 'completed') completeChangeSession(session);
    else session.status = state;
    this.eventBus.publish('agent.completion.reviewed', {
      session_id: session.id,
      completion
    }, this.eventContext());
    this.refreshControlPlane();
    return completion;
  }

  refreshInterventions(impact = null) {
    if (!this.activeChangeSession) return { interventions: [], summary: { open: 0, high: 0, medium: 0, low: 0 } };
    const proposal = this.activeChangeSession.change_proposal;
    if (!proposal) return { interventions: [], summary: { open: 0, high: 0, medium: 0, low: 0 } };
    const computedImpact = impact || computeImpact(this.model, this.activeChangeSession.files);
    const evaluation = interventionEngine({
      model: this.model,
      proposal,
      impact: computedImpact,
      changeSession: this.activeChangeSession,
      evidence: summarizeEvidence(this.evidenceState),
      affectedCapabilities: computedImpact.affected.capabilities ? ['analytics.execution'] : []
    });
    updateChangeSession(this.activeChangeSession, {
      interventions: evaluation.interventions,
      interventionSummary: evaluation.summary
    });
    if (evaluation.summary.open) {
      this.eventBus.publish('intervention.detected', {
        summary: evaluation.summary,
        interventions: evaluation.interventions
      }, this.eventContext());
    }
    this.refreshControlPlane();
    return evaluation;
  }

  listAgentEvents(sessionId, sinceSequence = 0) {
    const session = this.ensureAgentChangeSession(sessionId);
    if (!session) return null;
    return this.eventBus
      .list(sinceSequence)
      .filter((event) => !event.change_session_id || event.change_session_id === session.id)
      .map((event) => ({ ...event, type: mapEventType(event.type), agent_session_id: session.agent_session_id }));
  }

  getActiveChangeRoom() {
    const session = this.activeChangeSession;
    if (!session) return null;
    const room = session.change_room?.id ? this.buzzAdapter.getRoom(session.change_room.id) : this.buzzAdapter.getRoomByChangeSessionId(session.id);
    if (!room) return null;
    updateChangeSession(session, { changeRoom: room });
    return room;
  }

  addChangeRoomParticipant(input = {}) {
    const room = this.getActiveChangeRoom();
    if (!room) return null;
    const participant = this.buzzAdapter.upsertParticipant(room.id, input);
    updateChangeSession(this.activeChangeSession, { changeRoom: this.buzzAdapter.getRoom(room.id) });
    this.eventBus.publish('change-room.updated', room, this.eventContext());
    this.refreshControlPlane();
    return participant;
  }

  submitAdvisoryContribution(input = {}) {
    const room = this.getActiveChangeRoom();
    if (!room) return null;
    const contribution = this.buzzAdapter.publishContribution(room.id, input);
    if (!contribution) return null;
    const contributions = this.buzzAdapter.listContributions(room.id);
    updateChangeSession(this.activeChangeSession, {
      changeRoom: this.buzzAdapter.getRoom(room.id),
      advisoryContributions: contributions
    });
    this.refreshControlPlane();
    this.eventBus.publish('advisory.contribution.published', { contribution }, this.eventContext());
    return contribution;
  }

  listAdvisoryContributions(options = {}) {
    const room = this.getActiveChangeRoom();
    if (!room) return null;
    return this.buzzAdapter.listContributions(room.id, options);
  }

  getParticipantIdForAgentSession(sessionId) {
    const agentSession = this.getAgentSession(sessionId);
    if (!agentSession) return null;
    return `participant-${agentSession.agent_id}`;
  }

  getParticipantIdForActor(actor = {}) {
    if (actor.type === 'agent' && actor.id) return `participant-${actor.id}`;
    if (actor.type === 'human') return 'participant-engineering-owner';
    if (actor.type === 'archie') return 'participant-archie';
    return 'participant-archie';
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
      evidence: summarizeEvidence(this.evidenceState),
      control_plane: this.getControlPlaneSnapshot()
    };
  }

  getActiveControlPlaneState() {
    return this.getControlPlaneSnapshot().activeEngineeringState || null;
  }

  listPolicies() {
    return (this.getControlPlaneSnapshot().policy?.policies || []).map((policy) => ({
      id: policy.id,
      name: policy.name,
      description: policy.description,
      domain: policy.domain,
      priority: policy.priority
    }));
  }

  getPolicy(policyId) {
    return this.listPolicies().find((entry) => entry.id === policyId) || null;
  }

  listPolicyEvaluations() {
    return this.controlPlaneState.policyEvaluations || [];
  }

  listInterventions() {
    return this.controlPlaneState.interventions || [];
  }

  getIntervention(id) {
    return this.listInterventions().find((entry) => entry.id === id) || null;
  }

  acknowledgeIntervention(id, input = {}) {
    const intervention = this.getIntervention(id);
    if (!intervention) return null;
    acknowledgeIntervention(intervention, input.actor || 'participant');
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.INTERVENTION_ACKNOWLEDGED, { intervention }, this.eventContext());
    return intervention;
  }

  resolveIntervention(id, input = {}) {
    const intervention = this.getIntervention(id);
    if (!intervention) return null;
    resolveIntervention(intervention, input);
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.INTERVENTION_RESOLVED, { intervention }, this.eventContext());
    return intervention;
  }

  waiveIntervention(id, input = {}) {
    const intervention = this.getIntervention(id);
    if (!intervention) return null;
    waiveIntervention(intervention, input);
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.INTERVENTION_WAIVED, { intervention }, this.eventContext());
    return intervention;
  }

  escalateIntervention(id, input = {}) {
    const intervention = this.getIntervention(id);
    if (!intervention) return null;
    escalateIntervention(intervention, input);
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.INTERVENTION_ESCALATED, { intervention }, this.eventContext());
    return intervention;
  }

  listRequirements() {
    return this.controlPlaneState.requirements || [];
  }

  getRequirement(id) {
    return this.listRequirements().find((entry) => entry.id === id) || null;
  }

  satisfyRequirement(id, input = {}) {
    const requirement = this.getRequirement(id);
    if (!requirement) return null;
    requirement.status = input.status || 'satisfied';
    requirement.satisfiedAt = new Date().toISOString();
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.REQUIREMENT_UPDATED, { requirement }, this.eventContext());
    return requirement;
  }

  listCoordinationActions() {
    return this.controlPlaneState.coordinationActions || [];
  }

  createCoordinationAction(input = {}) {
    const action = {
      id: input.id || `coord_manual_${Date.now()}`,
      changeId: input.changeId || this.activeChangeSession?.id || null,
      conflictId: input.conflictId || null,
      participants: input.participants || [],
      options: input.options || [],
      status: 'open',
      selectedOption: null,
      createdAt: new Date().toISOString()
    };
    this.controlPlaneState.coordinationActions = [...this.listCoordinationActions(), action];
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.COORDINATION_REQUIRED, { action }, this.eventContext());
    return action;
  }

  resolveCoordinationAction(id, input = {}) {
    const actions = this.listCoordinationActions();
    const action = actions.find((entry) => entry.id === id);
    if (!action) return null;
    const resolved = resolveCoordinationAction(action, input);
    this.controlPlaneState.coordinationActions = actions.map((entry) => (entry.id === id ? resolved : entry));
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.COORDINATION_RESOLVED, { action: resolved }, this.eventContext());
    return resolved;
  }

  escalateCoordinationAction(id, input = {}) {
    const actions = this.listCoordinationActions();
    const action = actions.find((entry) => entry.id === id);
    if (!action) return null;
    action.status = 'escalated';
    action.escalatedAt = new Date().toISOString();
    action.escalationReason = input.reason || 'Escalated to human decision';
    this.controlPlaneState.coordinationActions = actions;
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.COORDINATION_REQUIRED, { action }, this.eventContext());
    return action;
  }

  listParticipantContexts() {
    return this.controlPlaneState.participantContexts || [];
  }

  getParticipantContext(participantId) {
    return this.listParticipantContexts().find((entry) => entry.participantId === participantId) || null;
  }

  refreshParticipantContext(participantId) {
    const contexts = this.listParticipantContexts();
    const existing = contexts.find((entry) => entry.participantId === participantId);
    if (!existing) return null;
    const refreshed = refreshParticipantContext(existing);
    this.controlPlaneState.participantContexts = contexts.map((entry) => (entry.participantId === participantId ? refreshed : entry));
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.CONTEXT_REFRESHED, { context: refreshed }, this.eventContext());
    return refreshed;
  }

  acknowledgeParticipantContext(participantId, input = {}) {
    const contexts = this.listParticipantContexts();
    const existing = contexts.find((entry) => entry.participantId === participantId);
    if (!existing) return null;
    const acknowledged = acknowledgeContext(existing, input.actor || participantId);
    this.controlPlaneState.participantContexts = contexts.map((entry) => (entry.participantId === participantId ? acknowledged : entry));
    this.refreshControlPlane();
    this.eventBus.publish(CONTROL_PLANE_EVENTS.CONTEXT_REFRESH_REQUIRED, { context: acknowledged }, this.eventContext());
    return acknowledged;
  }

  evaluateTransition(transition = 'plan') {
    const snapshot = this.getControlPlaneSnapshot();
    const result = evaluateChangeTransition({
      transition,
      requirements: snapshot.requirements || [],
      interventions: snapshot.interventions || []
    });
    this.eventBus.publish(CONTROL_PLANE_EVENTS.TRANSITION_EVALUATED, { transition, result }, this.eventContext());
    return result;
  }

  applyTransition(changeId, transition = 'plan') {
    const result = this.evaluateTransition(transition);
    if (!result.allowed) return { accepted: false, transition, evaluation: result, changeId };
    if (this.activeChangeSession && (!changeId || this.activeChangeSession.id === changeId)) {
      this.activeChangeSession.status = mapTransitionToStatus(transition, this.activeChangeSession.status);
    }
    return { accepted: true, transition, evaluation: result, changeId: changeId || this.activeChangeSession?.id || null };
  }

  getCompletionReadiness(changeId = null) {
    const readiness = this.getControlPlaneSnapshot().completionReadiness || null;
    return {
      changeId: changeId || this.activeChangeSession?.id || null,
      ...(readiness || {})
    };
  }

  completeChange(changeId = null, input = {}) {
    const readiness = this.getCompletionReadiness(changeId);
    const decision = evaluateCompletionDecision(readiness, input);
    this.controlPlaneState.addCompletionAttempt({ ...decision, changeId: readiness.changeId, attemptedAt: new Date().toISOString() });
    this.eventBus.publish(CONTROL_PLANE_EVENTS.COMPLETION_EVALUATED, { decision }, this.eventContext());
    if (decision.accepted && this.activeChangeSession && this.activeChangeSession.id === readiness.changeId) {
      this.activeChangeSession.status = 'completed';
    }
    return { changeId: readiness.changeId, ...decision };
  }

  publishControlPlaneDerivedEvents(snapshot = {}) {
    const events = [];
    for (const evaluation of snapshot.policy?.evaluations || []) {
      events.push({ type: CONTROL_PLANE_EVENTS.POLICY_EVALUATED, payload: { evaluation } });
      if (evaluation.status === 'violated') {
        events.push({ type: CONTROL_PLANE_EVENTS.POLICY_VIOLATED, payload: { evaluation } });
      }
    }
    for (const requirement of snapshot.requirements || []) {
      events.push({ type: CONTROL_PLANE_EVENTS.REQUIREMENT_CREATED, payload: { requirement } });
    }
    for (const intervention of snapshot.interventions || []) {
      events.push({ type: CONTROL_PLANE_EVENTS.INTERVENTION_CREATED, payload: { intervention } });
    }
    for (const invalidation of snapshot.context?.invalidations || []) {
      events.push({ type: CONTROL_PLANE_EVENTS.CONTEXT_INVALIDATED, payload: invalidation });
    }
    for (const action of snapshot.coordinationActions || []) {
      events.push({ type: CONTROL_PLANE_EVENTS.COORDINATION_REQUIRED, payload: { action } });
    }
    if (snapshot.activeEngineeringState?.reviewState?.requiresHumanDecision) {
      events.push({ type: CONTROL_PLANE_EVENTS.REVIEW_REQUIRED, payload: { changeId: snapshot.activeEngineeringState.changeId } });
    }
    publishControlPlaneEvents(this.eventBus, events.slice(0, 50), this.eventContext());
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
      assurance: this.assurance,
      control_plane: this.getControlPlaneSnapshot()
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

function buildImplementationOrder(impact, proposal) {
  const order = [];
  if (impact.affected.contracts.length) order.push('Extend the canonical contract with compatibility first');
  if (impact.affected.runtimes.length) order.push('Update runtime adapters before worker implementation');
  if (proposal.scope?.declaredFiles?.length) order.push('Implement declared files in reviewed scope order');
  order.push('Add contract and integration evidence');
  order.push('Run final verification for affected capabilities');
  return order;
}

function mapTransitionToStatus(transition, currentStatus = 'active') {
  const mapping = {
    start: 'active',
    plan: 'planning',
    implement: 'implementing',
    verify: 'verifying',
    review: 'reviewing',
    complete: 'completed'
  };
  return mapping[transition] || currentStatus;
}
