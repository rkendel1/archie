#!/usr/bin/env node
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const {
  buildModel,
  saveModel,
  loadModel,
  writeWorkflow,
  computeImpact,
  listChangedFiles,
  checkModel,
  verifyEvidence,
  confirmUnderstanding,
  correctArchitecture
} = require('./model');

const DEFAULT_STATE_PATH = path.join(os.homedir(), '.archie-desktop-state.json');
const CHANGE_STATUSES = ['draft', 'reviewing', 'approved', 'constrained', 'implementing', 'verifying', 'completed', 'blocked'];
const ROOM_FILTERS = new Set(['active', 'unread', 'my_changes', 'completed', 'archived']);
const PRESENCE = new Set(['online', 'idle', 'working', 'reviewing', 'waiting', 'typing', 'offline', 'disconnected']);

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk.toString(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'change';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

class DesktopRegistry {
  constructor(statePath = DEFAULT_STATE_PATH) {
    this.statePath = statePath;
    this.state = {
      projects: [],
      activeProjectId: null,
      projectRoutes: {},
      recentProjects: [],
      notifications: []
    };
    this.load();
  }

  load() {
    try {
      const raw = fs.readFileSync(this.statePath, 'utf8');
      const state = JSON.parse(raw);
      if (state && typeof state === 'object') this.state = { ...this.state, ...state };
    } catch {
      // no-op
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    fs.writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
  }

  listProjects(search = '') {
    const query = String(search || '').trim().toLowerCase();
    const projects = this.state.projects
      .filter((project) => !query || project.name.toLowerCase().includes(query) || project.repository.path.toLowerCase().includes(query))
      .sort((a, b) => String(b.lastOpenedAt).localeCompare(String(a.lastOpenedAt)));
    return projects;
  }

  getProject(projectId) {
    return this.state.projects.find((project) => project.id === projectId) || null;
  }

  getActiveProject() {
    return this.getProject(this.state.activeProjectId);
  }

  upsertProject(repoPath, name = '') {
    const absoluteRepoPath = path.resolve(repoPath || process.cwd());
    const model = buildModel(absoluteRepoPath);
    saveModel(absoluteRepoPath, model);

    const existing = this.state.projects.find((project) => project.repository.path === absoluteRepoPath);
    if (existing) {
      hydrateProject(existing, model);
      existing.lastOpenedAt = now();
      existing.runtime.status = 'connected';
      this.touchRecent(existing.id);
      this.state.activeProjectId = existing.id;
      this.save();
      return { project: existing, model };
    }

    const project = createDesktopProject({ repoPath: absoluteRepoPath, name, model });
    this.state.projects.push(project);
    this.state.activeProjectId = project.id;
    this.touchRecent(project.id);
    this.save();
    return { project, model };
  }

  selectProject(projectId, route = '') {
    const project = this.getProject(projectId);
    if (!project) return null;
    this.state.activeProjectId = project.id;
    project.runtime.status = 'connected';
    project.lastOpenedAt = now();
    if (route) this.state.projectRoutes[project.id] = route;
    this.touchRecent(project.id);
    this.save();
    return project;
  }

  setProjectRoute(projectId, route) {
    if (!this.getProject(projectId)) return;
    this.state.projectRoutes[projectId] = route;
    this.save();
  }

  getProjectRoute(projectId) {
    return this.state.projectRoutes[projectId] || '/overview';
  }

  createChange(projectId, input = {}) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const participants = ensureArray(input.participants).length
      ? input.participants
      : ['You', 'Archie'];
    const change = buildChange(input, participants);
    project.workspace.changes.unshift(change);
    project.workspace.rooms.unshift(buildRoomFromChange(change, participants));
    project.workspace.activity.unshift(makeActivity({
      type: 'change-created',
      actor: 'You',
      summary: `Created change ${change.title}`,
      changeId: change.id,
      roomId: change.roomId
    }));
    project.workspace.notifications.unshift(makeNotification({
      type: 'change-status',
      actor: 'Archie',
      title: 'New change opened',
      summary: change.title,
      changeId: change.id,
      roomId: change.roomId,
      unread: true
    }));
    project.workspace.activeChangeId = change.id;
    recalculateProjectSummary(project);
    this.save();
    return change;
  }

  postRoomMessage(projectId, roomId, input = {}) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const room = project.workspace.rooms.find((entry) => entry.id === roomId);
    if (!room) return null;
    const text = String(input.text || '').trim();
    if (!text) return null;
    const sender = String(input.sender || 'You').trim() || 'You';
    const mentions = Array.from(new Set((text.match(/@([a-zA-Z0-9_-]+)/g) || []).map((entry) => entry.slice(1).toLowerCase())));
    const message = {
      id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      sender,
      role: String(input.role || (sender === 'Archie' ? 'system-intelligence-advisor' : 'engineering-owner')),
      text,
      mentions,
      threadCount: 0,
      reactions: {},
      createdAt: now()
    };
    room.messages.push(message);
    room.unreadCount += sender === 'You' ? 0 : 1;
    room.lastActivityAt = message.createdAt;

    if (mentions.includes('archie')) {
      const response = {
        id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        sender: 'Archie',
        role: 'system-intelligence-advisor',
        text: `Contract impact review for ${room.changeTitle}: TypeScript, Python, and Rust consumers still require compatibility evidence.`,
        mentions: ['you'],
        threadCount: 0,
        reactions: {},
        createdAt: now()
      };
      room.messages.push(response);
      room.unreadCount += 1;
      project.workspace.notifications.unshift(makeNotification({
        type: 'mention',
        actor: 'Archie',
        title: 'Archie mentioned you',
        summary: room.changeTitle,
        changeId: room.changeId,
        roomId: room.id,
        unread: true
      }));
    }

    project.workspace.activity.unshift(makeActivity({
      type: 'room-message',
      actor: sender,
      summary: `Posted in #${room.displayName}`,
      roomId: room.id,
      changeId: room.changeId
    }));
    recalculateProjectSummary(project);
    this.save();
    return message;
  }

  touchRecent(projectId) {
    this.state.recentProjects = [projectId, ...this.state.recentProjects.filter((id) => id !== projectId)].slice(0, 10);
  }
}

function createDesktopProject({ repoPath, name, model }) {
  const ts = now();
  const projectId = `project_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const projectName = String(name || path.basename(repoPath));
  const firstChange = buildChange({
    title: 'Initial repository understanding',
    outcome: 'Establish baseline architecture, contracts, and evidence expectations',
    status: 'implementing',
    files: model.importantFiles.slice(0, 3).map((entry) => entry.file),
    participants: ['You', 'Archie']
  }, ['You', 'Archie']);
  const room = buildRoomFromChange(firstChange, ['You', 'Archie']);

  /** @type {{id:string,name:string,repository:{path:string,remote?:string,branch?:string,revision?:string},runtime:{status:'starting'|'connected'|'offline'|'error',endpoint?:string},summary:{activeChanges:number,activeRooms:number,activeParticipants:number,openInterventions:number,assuranceScore?:number},lastOpenedAt:string,createdAt:string}} */
  const project = {
    id: projectId,
    name: projectName,
    repository: {
      path: repoPath,
      remote: undefined,
      branch: 'local',
      revision: undefined
    },
    runtime: {
      status: 'connected',
      endpoint: `file://${repoPath}`
    },
    summary: {
      activeChanges: 1,
      activeRooms: 1,
      activeParticipants: 2,
      openInterventions: 1,
      assuranceScore: model.confidence
    },
    lastOpenedAt: ts,
    createdAt: ts,
    workspace: {
      model,
      activeChangeId: firstChange.id,
      changes: [firstChange],
      rooms: [room],
      participants: [
        participant('You', 'engineering-owner', 'online', ['intent', 'decisions'], firstChange.id),
        participant('Archie', 'system-intelligence-advisor', 'working', ['impact-analysis', 'interventions', 'evidence'], firstChange.id)
      ],
      activity: [
        makeActivity({
          type: 'project-opened',
          actor: 'Archie',
          summary: `Opened project workspace for ${projectName}`,
          changeId: firstChange.id,
          roomId: room.id
        })
      ],
      notifications: [
        makeNotification({
          type: 'intervention',
          actor: 'Archie',
          title: 'High contract intervention',
          summary: firstChange.title,
          changeId: firstChange.id,
          roomId: room.id,
          unread: true
        })
      ]
    }
  };

  return project;
}

function hydrateProject(project, model) {
  project.workspace = project.workspace || {};
  project.workspace.model = model;
  project.workspace.changes = ensureArray(project.workspace.changes);
  project.workspace.rooms = ensureArray(project.workspace.rooms);
  project.workspace.participants = ensureArray(project.workspace.participants);
  project.workspace.activity = ensureArray(project.workspace.activity);
  project.workspace.notifications = ensureArray(project.workspace.notifications);
  if (!project.workspace.changes.length) {
    const seeded = buildChange({ title: 'Reconnected workspace', status: 'implementing', files: model.importantFiles.slice(0, 2).map((entry) => entry.file) }, ['You', 'Archie']);
    project.workspace.changes = [seeded];
    project.workspace.rooms = [buildRoomFromChange(seeded, ['You', 'Archie'])];
    project.workspace.activeChangeId = seeded.id;
  }
  recalculateProjectSummary(project);
}

function participant(name, role, status, capabilities, changeId) {
  const normalizedStatus = PRESENCE.has(status) ? status : 'online';
  return {
    id: `participant_${slugify(name)}`,
    name,
    role,
    status: normalizedStatus,
    currentActivity: normalizedStatus === 'working' ? `Working on ${changeId}` : normalizedStatus,
    capabilities,
    activeChanges: [changeId],
    recentContributions: []
  };
}

function buildChange(input = {}, participants = []) {
  const id = `change_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const title = String(input.title || input.intent || 'New engineering change').trim();
  const status = CHANGE_STATUSES.includes(String(input.status || '').toLowerCase()) ? String(input.status).toLowerCase() : 'implementing';
  const ts = now();
  const planSteps = ensureArray(input.planSteps).length ? ensureArray(input.planSteps) : [
    { title: 'Review contract impact', done: true },
    { title: 'Implement scoped files', done: false },
    { title: 'Collect required evidence', done: false }
  ];
  const evidenceRequired = Math.max(1, Number(input.requiredEvidence || 3));
  const evidenceDone = Math.min(evidenceRequired, Number(input.evidenceDone || 1));
  const assurance = Number.isFinite(input.assuranceScore) ? Number(input.assuranceScore) : 70;
  const files = ensureArray(input.files).filter(Boolean);
  const interventions = {
    high: Number(input.highInterventions || 1),
    medium: Number(input.mediumInterventions || 0),
    low: Number(input.lowInterventions || 0)
  };

  return {
    id,
    title,
    status,
    intent: title,
    desiredOutcome: String(input.outcome || ''),
    implementationScope: files,
    participants,
    roomId: `room_${slugify(title)}_${id.slice(-4)}`,
    tabs: ['overview', 'room', 'implementation', 'plan', 'system-impact', 'interventions', 'evidence', 'verification', 'completion'],
    planSteps,
    progress: `${planSteps.filter((step) => step.done).length} / ${planSteps.length}`,
    interventions,
    evidence: { done: evidenceDone, required: evidenceRequired },
    assuranceScore: assurance,
    constraints: ['Preserve contract compatibility', 'Avoid runtime topology drift'],
    verification: {
      required: ['Unit tests', 'Contract test', 'Cross-runtime test', 'Capability verification'],
      completed: ['Unit tests', 'Contract test']
    },
    completion: { ready: evidenceDone >= evidenceRequired && assurance >= 85 },
    createdAt: ts,
    updatedAt: ts
  };
}

function buildRoomFromChange(change, participantNames = []) {
  const labels = participantNames.length ? participantNames : ['You', 'Archie'];
  return {
    id: change.roomId,
    changeId: change.id,
    changeTitle: change.title,
    displayName: slugify(change.title),
    canonicalName: change.id,
    status: change.status === 'completed' ? 'completed' : 'active',
    unreadCount: 0,
    participants: labels,
    presence: labels.map((name, index) => ({ name, status: index === 1 ? 'working' : 'online' })),
    typing: [],
    working: [{ name: 'Archie', activity: 'Recomputing system impact' }],
    pinnedContext: {
      change: change.title,
      systemImpact: '2 capabilities · 2 runtimes · 1 contract',
      guidance: [
        'Preserve AnalyticsRequest v2',
        'Update runtime manifest evidence',
        'Add cross-runtime verification'
      ]
    },
    messages: [
      {
        id: `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        sender: 'Archie',
        role: 'system-intelligence-advisor',
        text: `Recommendation: Keep ${change.title} in the existing runtime and verify contract compatibility.`,
        mentions: [],
        threadCount: 0,
        reactions: { thumbs_up: 1 },
        createdAt: now()
      }
    ],
    lastActivityAt: now()
  };
}

function makeActivity({ type, actor, summary, changeId, roomId }) {
  return {
    id: `activity_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    type,
    actor,
    summary,
    changeId,
    roomId,
    createdAt: now()
  };
}

function makeNotification({ type, actor, title, summary, changeId, roomId, unread }) {
  return {
    id: `notif_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    type,
    actor,
    title,
    summary,
    changeId,
    roomId,
    unread: Boolean(unread),
    createdAt: now()
  };
}

function recalculateProjectSummary(project) {
  const changes = ensureArray(project.workspace?.changes);
  const rooms = ensureArray(project.workspace?.rooms);
  const participants = ensureArray(project.workspace?.participants);
  const openInterventions = changes.reduce((count, change) => count + (change.interventions?.high || 0) + (change.interventions?.medium || 0), 0);
  project.summary = {
    activeChanges: changes.filter((change) => !['completed', 'blocked'].includes(change.status)).length,
    activeRooms: rooms.filter((room) => ['active', 'verifying'].includes(room.status)).length,
    activeParticipants: participants.filter((entry) => !['offline', 'disconnected'].includes(entry.status)).length,
    openInterventions,
    assuranceScore: Math.round(changes.reduce((score, change) => score + Number(change.assuranceScore || 0), 0) / Math.max(changes.length, 1))
  };
}

function workspaceFor(project, route = '/overview') {
  const changes = ensureArray(project.workspace.changes);
  const rooms = ensureArray(project.workspace.rooms);
  const participants = ensureArray(project.workspace.participants);
  const activeChange = changes.find((change) => change.id === project.workspace.activeChangeId) || changes[0] || null;
  const activeRoom = activeChange ? rooms.find((room) => room.changeId === activeChange.id) || rooms[0] : rooms[0] || null;
  const unreadRooms = rooms.filter((room) => room.unreadCount > 0).length;
  const unreadNotifications = ensureArray(project.workspace.notifications).filter((entry) => entry.unread).length;

  return {
    project,
    activeRoute: route,
    navigation: {
      overview: true,
      changes: project.summary.activeChanges,
      rooms: project.summary.activeRooms,
      participants: project.summary.activeParticipants,
      interventions: project.summary.openInterventions,
      evidence: changes.filter((change) => change.evidence.done < change.evidence.required).length,
      reviewQueue: buildReviewQueue(changes).summary.requiresDecision,
      notifications: unreadNotifications
    },
    sections: {
      overview: {
        repository: path.basename(project.repository.path),
        runtime: project.runtime.status,
        branch: project.repository.branch,
        activeChanges: changes.slice(0, 5),
        activeRooms: rooms.slice(0, 5),
        systemStatus: {
          capabilities: project.workspace.model?.importantFiles?.length || 0,
          runtimes: project.workspace.model?.runtimes?.length || 0,
          contracts: project.workspace.model?.contracts?.length || 0,
          openUncertainty: project.workspace.model?.uncertainties?.length || 0,
          assurance: project.summary.assuranceScore
        }
      },
      changes,
      rooms,
      participants,
      activity: ensureArray(project.workspace.activity),
      notifications: ensureArray(project.workspace.notifications),
      reviewQueue: buildReviewQueue(changes),
      nextImplementations: buildNextImplementations(project),
      activeChange,
      activeRoom,
      unreadRooms
    },
    engineeringContext: buildEngineeringContext(activeChange)
  };
}

function buildEngineeringContext(change) {
  if (!change) {
    return {
      mode: 'overview',
      summary: 'Select a change to load engineering context'
    };
  }
  return {
    mode: change.status === 'verifying' ? 'verification' : 'room',
    change: change.title,
    status: change.status,
    systemImpact: {
      capabilities: 2,
      runtimes: 2,
      contracts: 1
    },
    openInterventions: change.interventions.high + change.interventions.medium,
    evidence: `${change.evidence.done} / ${change.evidence.required}`,
    assurance: change.assuranceScore,
    guidance: [
      'Preserve AnalyticsRequest v2',
      'Update Rust capability manifest',
      'Add cross-runtime evidence'
    ],
    implementation: {
      currentStep: change.progress,
      observedFiles: change.implementationScope,
      scopeDrift: 'None',
      planDrift: 'None'
    },
    verification: {
      required: change.verification.required,
      completed: change.verification.completed,
      completion: change.completion.ready ? 'Ready' : 'Not ready'
    },
    reviewQueue: buildReviewQueue([change]).summary
  };
}

function buildReviewQueue(changes = []) {
  const items = changes.map((change) => {
    const hasContractRisk = change.constraints.some((entry) => /contract/i.test(entry));
    const hasRuntimeRisk = change.constraints.some((entry) => /runtime/i.test(entry));
    const hasHighIntervention = (change.interventions?.high || 0) > 0;
    let risk = 'LOW';
    if (hasHighIntervention && hasContractRisk && hasRuntimeRisk) risk = 'CRITICAL';
    else if (hasHighIntervention || hasContractRisk) risk = 'HIGH';
    else if ((change.interventions?.medium || 0) > 0 || !change.completion.ready) risk = 'MEDIUM';
    return {
      changeId: change.id,
      title: change.title,
      risk,
      requiresDecision: risk === 'CRITICAL' || risk === 'HIGH'
    };
  });
  return {
    items,
    summary: {
      requiresDecision: items.filter((entry) => entry.requiresDecision).length,
      highRisk: items.filter((entry) => ['HIGH', 'CRITICAL'].includes(entry.risk)).length,
      readyForCompletion: items.filter((entry) => entry.risk === 'LOW').length,
      lowRisk: items.filter((entry) => entry.risk === 'LOW').length
    }
  };
}

function buildNextImplementations(project) {
  const uncertainties = ensureArray(project.workspace.model?.uncertainties);
  const contracts = ensureArray(project.workspace.model?.contracts);
  return [
    {
      id: 'next-python-contract-verification',
      title: 'Add Python contract compatibility verification',
      whyNow: 'Python consumers are present without full compatibility evidence.',
      impact: 'HIGH',
      confidence: 91,
      expectedWork: '2 files · 1 test',
      dependencies: ['Current active contract change'],
      suggestedParticipants: ['You', 'Archie', 'Coding Agent']
    },
    {
      id: 'next-worker-uncertainty',
      title: 'Resolve analytics worker uncertainty',
      whyNow: uncertainties[0] || 'Worker configuration is partially modeled.',
      impact: 'MEDIUM',
      confidence: 76,
      expectedWork: 'Investigation',
      dependencies: ['Architecture impact review'],
      suggestedParticipants: ['Archie', 'External LLM']
    },
    {
      id: 'next-runtime-topology-evidence',
      title: 'Add runtime topology evidence',
      whyNow: contracts.length ? 'Recent contract updates may invalidate architecture evidence.' : 'Runtime topology lacks current evidence.',
      impact: 'MEDIUM',
      confidence: 84,
      expectedWork: 'Evidence update',
      dependencies: ['Contract verification'],
      suggestedParticipants: ['You', 'Coding Agent']
    }
  ];
}

function page() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Archie Desktop Command Center</title>
  <style>
    :root { color-scheme: dark; }
    body { font-family: system-ui, sans-serif; margin: 0; background: #0b1220; color: #e5e7eb; }
    .layout { display: grid; grid-template-columns: 90px minmax(220px, 18vw) 1fr minmax(260px, 24vw); min-height: 100vh; }
    .panel { border-right: 1px solid #1f2937; padding: 12px; overflow: auto; resize: horizontal; }
    .panel:last-child { border-right: none; }
    h1, h2, h3, h4 { margin: 8px 0; }
    .rail-item, .nav-item, .change-card, .room-item, .participant, .recommendation { background: #111827; border: 1px solid #1f2937; border-radius: 8px; padding: 8px; margin-bottom: 8px; }
    .small { color: #9ca3af; font-size: 12px; }
    .badge { float: right; background: #1f2937; border-radius: 999px; padding: 2px 8px; font-size: 11px; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .toolbar input, .toolbar button, .toolbar select, textarea { background: #0f172a; color: #e5e7eb; border: 1px solid #374151; border-radius: 6px; padding: 8px; }
    .workspace-grid { display: grid; grid-template-columns: minmax(180px, 220px) 1fr; gap: 12px; }
    .message { background: #0f172a; border-left: 3px solid #374151; padding: 8px; border-radius: 6px; margin-bottom: 8px; }
    .context-collapse { margin-top: 8px; }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="panel" style="resize:none;">
      <h3>ARCHIE</h3>
      <div class="rail-item">Projects</div>
      <div class="rail-item">Search</div>
      <div class="rail-item">Alerts</div>
      <div class="rail-item">Activity</div>
      <div class="rail-item">Runtime</div>
      <div class="rail-item">Settings</div>
    </aside>
    <aside class="panel" id="projectNav">
      <h3>PROJECT SWITCHER</h3>
      <div class="toolbar">
        <select id="projectSelect" onchange="selectProject()"></select>
      </div>
      <div class="toolbar">
        <input id="repo" placeholder="/absolute/path/to/repository" />
        <button onclick="openProject()">Open Project</button>
      </div>
      <div id="projectMeta" class="small"></div>
      <h4>PROJECT</h4>
      <div class="nav-item">Overview <span id="badgeOverview" class="badge">•</span></div>
      <div class="nav-item">Changes <span id="badgeChanges" class="badge">0</span></div>
      <div class="nav-item">Rooms <span id="badgeRooms" class="badge">0</span></div>
      <div class="nav-item">Participants <span id="badgeParticipants" class="badge">0</span></div>
      <div class="nav-item">Interventions <span id="badgeInterventions" class="badge">0</span></div>
      <div class="nav-item">Evidence <span id="badgeEvidence" class="badge">0</span></div>
      <div class="nav-item">Review Queue <span id="badgeReviewQueue" class="badge">0</span></div>
      <div class="nav-item">Notifications <span id="badgeNotifications" class="badge">0</span></div>
    </aside>
    <main class="panel" style="resize:none;">
      <h2 id="workspaceTitle">Project Workspace</h2>
      <div class="toolbar">
        <button onclick="loadWorkspace()">Refresh</button>
        <button onclick="createChange()">+ New Change</button>
        <input id="changeIntent" placeholder="What are you trying to accomplish?" style="min-width: 260px;"/>
      </div>
      <div class="workspace-grid">
        <div>
          <h4>PROJECT ROOMS</h4>
          <div id="rooms"></div>
        </div>
        <div>
          <h4>CHANGE WORK QUEUE</h4>
          <div id="changes"></div>
          <h4>ROOM STREAM</h4>
          <div id="roomMessages"></div>
          <div class="toolbar">
            <input id="roomMessage" placeholder="Message room (@archie, @coding-agent, @all)" style="min-width: 380px;"/>
            <button onclick="sendRoomMessage()">Send</button>
          </div>
          <h4>NEXT IMPLEMENTATIONS</h4>
          <div id="nextImplementations"></div>
        </div>
      </div>
    </main>
    <aside class="panel" id="contextPanel">
      <h3>ENGINEERING CONTEXT</h3>
      <button class="context-collapse" onclick="toggleContext()">Collapse</button>
      <pre id="context"></pre>
      <h4>PARTICIPANTS</h4>
      <div id="participants"></div>
      <h4>NOTIFICATIONS</h4>
      <div id="notifications"></div>
      <h4>ACTIVITY</h4>
      <div id="activity"></div>
    </aside>
  </div>
<script>
let activeProjectId = '';
let activeRoomId = '';

async function api(path, method='GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function el(id) { return document.getElementById(id); }

function renderCard(container, items, toText) {
  const target = el(container);
  target.innerHTML = '';
  for (const item of items) {
    const div = document.createElement('div');
    div.className = 'change-card';
    div.textContent = toText(item);
    target.appendChild(div);
  }
}

async function refreshProjectOptions() {
  const result = await api('/api/projects');
  const select = el('projectSelect');
  select.innerHTML = '';
  for (const project of result.projects) {
    const opt = document.createElement('option');
    opt.value = project.id;
    opt.textContent = project.name;
    if (result.activeProjectId === project.id) opt.selected = true;
    select.appendChild(opt);
  }
  activeProjectId = result.activeProjectId || (result.projects[0] && result.projects[0].id) || '';
  if (activeProjectId) await loadWorkspace();
}

async function openProject() {
  const repo = el('repo').value.trim();
  if (!repo) return;
  const result = await api('/api/projects/open', 'POST', { repo });
  activeProjectId = result.project.id;
  await refreshProjectOptions();
}

async function selectProject() {
  const id = el('projectSelect').value;
  if (!id) return;
  await api('/api/projects/select', 'POST', { projectId: id, route: '/overview' });
  activeProjectId = id;
  await loadWorkspace();
}

async function loadWorkspace() {
  if (!activeProjectId) return;
  const data = await api('/api/projects/' + activeProjectId + '/workspace');
  el('workspaceTitle').textContent = data.project.name + ' · Project Workspace';
  el('projectMeta').textContent = data.project.repository.path + '\nRuntime: ' + data.project.runtime.status + '\nBranch: ' + (data.project.repository.branch || 'local');
  el('badgeChanges').textContent = data.navigation.changes;
  el('badgeRooms').textContent = data.navigation.rooms;
  el('badgeParticipants').textContent = data.navigation.participants;
  el('badgeInterventions').textContent = data.navigation.interventions;
  el('badgeEvidence').textContent = data.navigation.evidence;
  el('badgeReviewQueue').textContent = data.navigation.reviewQueue;
  el('badgeNotifications').textContent = data.navigation.notifications;

  renderCard('changes', data.sections.changes, (change) =>
    change.title + ' · ' + change.status.toUpperCase() + ' · Progress ' + change.progress + ' · Evidence ' + change.evidence.done + '/' + change.evidence.required);

  renderCard('rooms', data.sections.rooms, (room) => '#' + room.displayName + ' · ' + room.participants.length + ' participants · unread ' + room.unreadCount);

  renderCard('participants', data.sections.participants, (entry) =>
    entry.name + ' · ' + entry.role + ' · ' + entry.status + ' · ' + (entry.currentActivity || ''));

  renderCard('notifications', data.sections.notifications.slice(0, 8), (entry) =>
    entry.actor + ' · ' + entry.title + ' · ' + entry.summary + (entry.unread ? ' (unread)' : ''));

  renderCard('activity', data.sections.activity.slice(0, 8), (entry) =>
    entry.actor + ' · ' + entry.summary + ' · ' + new Date(entry.createdAt).toLocaleTimeString());

  renderCard('nextImplementations', data.sections.nextImplementations, (entry) =>
    entry.title + ' · ' + entry.impact + ' · confidence ' + entry.confidence + '% · ' + entry.whyNow);

  activeRoomId = data.sections.activeRoom ? data.sections.activeRoom.id : '';
  const stream = el('roomMessages');
  stream.innerHTML = '';
  for (const message of (data.sections.activeRoom ? data.sections.activeRoom.messages : [])) {
    const div = document.createElement('div');
    div.className = 'message';
    div.textContent = message.sender + ' (' + message.role + '): ' + message.text;
    stream.appendChild(div);
  }

  el('context').textContent = JSON.stringify(data.engineeringContext, null, 2);
}

async function createChange() {
  if (!activeProjectId) return;
  const intent = el('changeIntent').value.trim();
  if (!intent) return;
  await api('/api/projects/' + activeProjectId + '/changes', 'POST', {
    title: intent,
    outcome: 'Deliver requested change outcome',
    participants: ['You', 'Archie', 'Coding Agent', 'External LLM']
  });
  el('changeIntent').value = '';
  await loadWorkspace();
}

async function sendRoomMessage() {
  if (!activeProjectId || !activeRoomId) return;
  const text = el('roomMessage').value.trim();
  if (!text) return;
  await api('/api/projects/' + activeProjectId + '/rooms/' + activeRoomId + '/messages', 'POST', {
    sender: 'You',
    role: 'engineering-owner',
    text
  });
  el('roomMessage').value = '';
  await loadWorkspace();
}

function toggleContext() {
  el('contextPanel').classList.toggle('hidden');
}

refreshProjectOptions();
</script>
</body>
</html>`;
}

function parseProjectPath(url, base) {
  const regex = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([^/]+)(?:/(.*))?$`);
  const match = url.pathname.match(regex);
  if (!match) return null;
  return { projectId: match[1], rest: match[2] || '' };
}

function startDesktopServer(optionsOrPort = Number(process.env.PORT || 43111)) {
  const options = typeof optionsOrPort === 'number'
    ? { port: optionsOrPort }
    : (optionsOrPort || {});
  const port = Number(options.port ?? process.env.PORT ?? 43111);
  const registry = new DesktopRegistry(options.statePath || process.env.ARCHIE_DESKTOP_STATE || DEFAULT_STATE_PATH);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/global/navigation') {
      return sendJson(res, 200, {
        items: ['Projects', 'Search', 'Alerts', 'Activity', 'Runtime', 'Settings'],
        projectScoped: false
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(res, 200, {
        activeProjectId: registry.state.activeProjectId,
        recentProjectIds: registry.state.recentProjects,
        projects: registry.listProjects(url.searchParams.get('search') || '').map((project) => ({
          id: project.id,
          name: project.name,
          runtime: project.runtime,
          summary: project.summary,
          lastOpenedAt: project.lastOpenedAt,
          createdAt: project.createdAt
        }))
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects/open') {
      const body = await parseBody(req);
      const opened = registry.upsertProject(body.repo || process.cwd(), body.name || '');
      return sendJson(res, 201, {
        ok: true,
        project: opened.project,
        restoredRoute: registry.getProjectRoute(opened.project.id)
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/projects/select') {
      const body = await parseBody(req);
      const project = registry.selectProject(body.projectId, body.route || '/overview');
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      return sendJson(res, 200, {
        ok: true,
        project,
        restoredRoute: registry.getProjectRoute(project.id)
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/projects/active') {
      const project = registry.getActiveProject();
      if (!project) return sendJson(res, 404, { error: 'No active project' });
      return sendJson(res, 200, {
        project,
        restoredRoute: registry.getProjectRoute(project.id)
      });
    }

    const workspacePath = parseProjectPath(url, '/api/projects');
    if (workspacePath) {
      const project = registry.getProject(workspacePath.projectId);
      if (!project) return sendJson(res, 404, { error: 'Project not found' });

      const rest = workspacePath.rest;
      if (req.method === 'GET' && rest === 'workspace') {
        return sendJson(res, 200, workspaceFor(project, registry.getProjectRoute(project.id)));
      }

      if (req.method === 'GET' && rest === 'changes') {
        const statusFilter = String(url.searchParams.get('status') || 'all').toLowerCase();
        const filtered = project.workspace.changes.filter((change) => statusFilter === 'all' || change.status === statusFilter);
        return sendJson(res, 200, { changes: filtered });
      }

      if (req.method === 'POST' && rest === 'changes') {
        const body = await parseBody(req);
        const change = registry.createChange(project.id, body);
        if (!change) return sendJson(res, 400, { error: 'Unable to create change' });
        return sendJson(res, 201, { change });
      }

      const changeMatch = rest.match(/^changes\/([^/]+)$/);
      if (req.method === 'GET' && changeMatch) {
        const change = project.workspace.changes.find((entry) => entry.id === changeMatch[1]);
        if (!change) return sendJson(res, 404, { error: 'Change not found' });
        return sendJson(res, 200, { change });
      }

      if (req.method === 'GET' && rest === 'rooms') {
        const mode = String(url.searchParams.get('filter') || 'active').toLowerCase();
        const changesById = new Map(project.workspace.changes.map((change) => [change.id, change]));
        const rooms = project.workspace.rooms.filter((room) => {
          if (!ROOM_FILTERS.has(mode) || mode === 'active') return room.status === 'active' || room.status === 'verifying';
          if (mode === 'unread') return room.unreadCount > 0;
          if (mode === 'completed') return room.status === 'completed';
          if (mode === 'archived') return room.status === 'archived';
          if (mode === 'my_changes') {
            const change = changesById.get(room.changeId);
            return change && ensureArray(change.participants).includes('You');
          }
          return true;
        });
        return sendJson(res, 200, { rooms });
      }

      const messageMatch = rest.match(/^rooms\/([^/]+)\/messages$/);
      if (messageMatch) {
        const roomId = messageMatch[1];
        if (req.method === 'GET') {
          const room = project.workspace.rooms.find((entry) => entry.id === roomId);
          if (!room) return sendJson(res, 404, { error: 'Room not found' });
          return sendJson(res, 200, {
            room: {
              ...room,
              threadsEnabled: true,
              mentionsEnabled: true,
              reactionsEnabled: true,
              unreadEnabled: true,
              participantPresenceEnabled: true,
              roomSearchEnabled: true
            }
          });
        }
        if (req.method === 'POST') {
          const body = await parseBody(req);
          const message = registry.postRoomMessage(project.id, roomId, body);
          if (!message) return sendJson(res, 400, { error: 'Message rejected' });
          return sendJson(res, 201, { message });
        }
      }

      if (req.method === 'GET' && rest === 'participants') {
        return sendJson(res, 200, { participants: project.workspace.participants });
      }

      if (req.method === 'GET' && rest === 'activity') {
        const filter = String(url.searchParams.get('filter') || 'all').toLowerCase();
        const activity = project.workspace.activity.filter((entry) => filter === 'all' || entry.type.includes(filter));
        return sendJson(res, 200, { activity });
      }

      if (req.method === 'GET' && rest === 'notifications') {
        const unreadOnly = url.searchParams.get('unread') === '1';
        const notifications = unreadOnly
          ? project.workspace.notifications.filter((entry) => entry.unread)
          : project.workspace.notifications;
        return sendJson(res, 200, { notifications });
      }

      if (req.method === 'GET' && rest === 'next-implementations') {
        return sendJson(res, 200, { recommendations: buildNextImplementations(project) });
      }

      if (req.method === 'GET' && rest === 'review-queue') {
        return sendJson(res, 200, { reviewQueue: buildReviewQueue(project.workspace.changes) });
      }
    }

    // Backwards compatible MVP endpoints.
    if (url.pathname === '/api/watch') {
      const repo = path.resolve(url.searchParams.get('repo') || process.cwd());
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ event: 'watch-started', repo })}\n\n`);

      let busy = false;
      const watcher = fs.watch(repo, { recursive: true }, (_event, filename) => {
        if (busy || !filename) return;
        if (filename.startsWith('.git/') || filename.startsWith('node_modules/')) return;
        busy = true;
        try {
          const model = buildModel(repo);
          saveModel(repo, model);
          const impact = computeImpact(model, [filename.replace(/\\/g, '/')]);
          res.write(`data: ${JSON.stringify({ event: 'change', file: filename, impact })}\n\n`);
        } finally {
          setTimeout(() => { busy = false; }, 200);
        }
      });

      req.on('close', () => watcher.close());
      return;
    }

    if (req.method !== 'POST' || !url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });

    const body = await parseBody(req);
    const repo = path.resolve(body.repo || process.cwd());

    if (url.pathname === '/api/open-repo') {
      const opened = registry.upsertProject(repo, body.name || '');
      const model = opened.model;
      return sendJson(res, 200, {
        ok: true,
        repo,
        identity: {
          repository: path.basename(repo),
          location: repo,
          branch: 'local',
          modelVersion: 1,
          lastAnalysis: model.generatedAt
        },
        technologyProfile: {
          languages: model.discovery.languages,
          frameworks: model.discovery.frameworks,
          dependencies: Object.keys(model.discovery.dependencies || {})
        },
        projectStructure: model.discovery,
        graph: { nodes: model.graph.nodes.length, edges: model.graph.edges.length },
        runtimes: model.runtimes,
        capabilities: model.importantFiles.filter((entry) => /capability|feature|service/i.test(entry.file)).length,
        importantFiles: model.importantFiles.slice(0, 10),
        architectureBoundaries: model.architecture,
        uncertainties: model.uncertainties,
        confidence: model.confidence
      });
    }

    if (url.pathname === '/api/analyze') {
      const model = buildModel(repo);
      saveModel(repo, model);
      return sendJson(res, 200, { ok: true, model });
    }

    if (url.pathname === '/api/impact') {
      const model = loadModel(repo) || buildModel(repo);
      saveModel(repo, model);
      const impact = computeImpact(model, listChangedFiles(repo));
      return sendJson(res, 200, { ok: true, impact });
    }

    if (url.pathname === '/api/check') {
      const model = loadModel(repo) || buildModel(repo);
      return sendJson(res, 200, checkModel(model, body.kind || 'architecture'));
    }

    if (url.pathname === '/api/verify') {
      const model = loadModel(repo) || buildModel(repo);
      return sendJson(res, 200, verifyEvidence(model, listChangedFiles(repo)));
    }

    if (url.pathname === '/api/generate-workflow') {
      const workflowPath = writeWorkflow(repo);
      return sendJson(res, 200, { ok: true, workflowPath });
    }

    if (url.pathname === '/api/confirm') {
      return sendJson(res, 200, { ok: true, decisions: confirmUnderstanding(repo) });
    }

    if (url.pathname === '/api/correct') {
      return sendJson(res, 200, { ok: true, decisions: correctArchitecture(repo, body.correction || '') });
    }

    return sendJson(res, 404, { error: 'Unknown endpoint' });
  });

  server.listen(port, () => {
    process.stdout.write(`Archie desktop command center running at http://localhost:${port}\n`);
  });

  return server;
}

if (require.main === module) startDesktopServer();

module.exports = { startDesktopServer };
