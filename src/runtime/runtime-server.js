const http = require('node:http');
const path = require('node:path');
const { RepositorySession } = require('./repository-session');
const { SUPPORTED_CAPABILITIES } = require('../agents/agent-capabilities');
const { formatContextMarkdown } = require('../protocols/agent-context');

function sendJson(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk.toString();
    });
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

class RuntimeServer {
  constructor(rootDir, options = {}) {
    this.rootDir = path.resolve(rootDir);
    this.host = options.host || '127.0.0.1';
    this.port = Number(options.port ?? 4317);
    this.repositorySession = options.session || new RepositorySession(this.rootDir);
    this.server = null;
    this.subscribers = new Set();
  }

  async start() {
    if (!this.repositorySession.model) this.repositorySession.initialize();
    this.repositorySession.startWatching();

    this.repositorySession.eventBus.on('event', (event) => {
      for (const res of this.subscribers) {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        return sendJson(res, 200, {
          ok: true,
          status: 'healthy',
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          repository_watch: this.repositorySession.watcher ? 'active' : 'inactive'
        });
      }

      if (req.method === 'GET' && url.pathname === '/.well-known/archie') {
        return sendJson(res, 200, this.repositorySession.discoverAgentParticipation());
      }

      if (req.method === 'GET' && url.pathname === '/v1/agent/protocol') {
        return sendJson(res, 200, this.repositorySession.discoverAgentParticipation());
      }

      if (req.method === 'GET' && url.pathname === '/v1/agent/capabilities') {
        return sendJson(res, 200, {
          protocol_version: '1.0',
          repository_id: this.repositorySession.repositoryId,
          capabilities: SUPPORTED_CAPABILITIES,
          services: [
            'intent',
            'context',
            'plan_review',
            'constraints',
            'change_observation',
            'evidence',
            'verification',
            'completion'
          ]
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/repository') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          root: this.repositorySession.rootDir,
          watch: this.repositorySession.watcher ? 'active' : 'inactive'
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/model') {
        const snapshot = this.repositorySession.snapshot();
        return sendJson(res, 200, snapshot);
      }

      if (req.method === 'GET' && url.pathname === '/v1/model/summary') {
        const { modelVersion, previousVersion, updatedAt, model, assurance, activeChangeSession, evidenceState } = this.repositorySession;
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: modelVersion,
          previous_version: previousVersion,
          updated_at: updatedAt,
          confidence: model?.confidence || 0,
          languages: model?.discovery?.languages || [],
          analyzers: model?.analyzers || [],
          architecture_layers: model?.architecture?.length || 0,
          runtimes: model?.runtimes?.length || 0,
          capabilities: model?.importantFiles?.filter((file) => /capability|feature|service/i.test(file.file)).length || 0,
          important_files: model?.importantFiles?.length || 0,
          uncertainties: model?.uncertainties?.length || 0,
          assurance,
          active_change_session: activeChangeSession,
          evidence: evidenceState
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/model/graph') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          graph: this.repositorySession.model?.graph || { nodes: [], edges: [] }
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/architecture') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          architecture: this.repositorySession.model?.architecture || []
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/runtimes') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          runtimes: this.repositorySession.model?.runtimes || []
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/contracts') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          contracts: this.repositorySession.model?.contracts || []
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/files/important') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          important_files: this.repositorySession.model?.importantFiles || []
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/changes/active') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          change_session: this.repositorySession.activeChangeSession
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/assurance') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          assurance: this.repositorySession.assurance
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/evidence') {
        return sendJson(res, 200, {
          repository_id: this.repositorySession.repositoryId,
          model_version: this.repositorySession.modelVersion,
          evidence: this.repositorySession.evidenceState
        });
      }

      if (req.method === 'GET' && url.pathname === '/v1/status') {
        return sendJson(res, 200, this.repositorySession.getStatus());
      }

      if (req.method === 'GET' && url.pathname === '/v1/events') {
        const wantsStream = req.headers.accept === 'text/event-stream' || url.searchParams.get('stream') === '1';
        if (!wantsStream) {
          const since = Number(url.searchParams.get('since') || 0);
          return sendJson(res, 200, { events: this.repositorySession.eventBus.list(since) });
        }

        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        });
        this.subscribers.add(res);

        const since = Number(url.searchParams.get('since') || 0);
        for (const event of this.repositorySession.eventBus.list(since)) {
          res.write(`event: ${event.type}\n`);
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }

        req.on('close', () => {
          this.subscribers.delete(res);
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/v1/sessions') {
        const body = await parseBody(req);
        const session = this.repositorySession.startChangeSession(body.intent);
        return sendJson(res, 201, session);
      }

      if (req.method === 'POST' && /^\/v1\/sessions\/[^/]+\/intent$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const session = this.repositorySession.setActiveSessionIntent(sessionId, body.intent);
        if (!session) return sendJson(res, 404, { error: 'Active change session not found' });
        return sendJson(res, 200, session);
      }

      if (req.method === 'POST' && url.pathname === '/v1/agent/sessions') {
        const body = await parseBody(req);
        const session = this.repositorySession.registerAgent(body);
        return sendJson(res, 201, session);
      }

      if (req.method === 'GET' && /^\/v1\/agent\/sessions\/[^/]+$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const agentSession = this.repositorySession.getAgentSession(sessionId);
        if (!agentSession) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, {
          ...agentSession,
          active_change_session: this.repositorySession.activeChangeSession
        });
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/intent$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const session = this.repositorySession.submitAgentIntent(sessionId, body.intent || body);
        if (!session) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, session);
      }

      if (req.method === 'GET' && /^\/v1\/agent\/sessions\/[^/]+\/context$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const detail = url.searchParams.get('detail') || 'focused';
        const format = (url.searchParams.get('format') || 'json').toLowerCase();
        const context = this.repositorySession.getAgentContext(sessionId, { detail });
        if (!context) return sendJson(res, 404, { error: 'Agent session not found' });
        if (format === 'markdown') {
          res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
          res.end(formatContextMarkdown(context));
          return;
        }
        if (format === 'summary') {
          return sendJson(res, 200, {
            intent: context.intent,
            constraints: context.constraints.map((entry) => entry.statement),
            important_files: context.important_files.map((entry) => entry.path),
            required_evidence: context.required_evidence
          });
        }
        if (format === 'yaml') {
          res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
          res.end(toYaml(context));
          return;
        }
        return sendJson(res, 200, context);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/plans$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const plan = this.repositorySession.submitAgentPlan(sessionId, body);
        if (!plan) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 201, plan);
      }

      if (req.method === 'GET' && /^\/v1\/agent\/sessions\/[^/]+\/plans$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const plans = this.repositorySession.listAgentPlans(sessionId);
        if (!plans) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, { plans });
      }

      if (req.method === 'GET' && /^\/v1\/agent\/sessions\/[^/]+\/plans\/[^/]+$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const planId = url.pathname.split('/')[6];
        const plan = this.repositorySession.getAgentPlan(sessionId, planId);
        if (!plan) return sendJson(res, 404, { error: 'Plan not found' });
        return sendJson(res, 200, plan);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/files$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const declaration = this.repositorySession.declareAgentFiles(sessionId, body.files || []);
        if (!declaration) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, declaration);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/implementation$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const report = this.repositorySession.submitImplementationReport(sessionId, body);
        if (!report) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, report);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/evidence$/.test(url.pathname)) {
        const body = await parseBody(req);
        const sessionId = url.pathname.split('/')[4];
        const report = this.repositorySession.submitEvidenceReport(sessionId, body);
        if (!report) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, report);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/verify$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const verification = this.repositorySession.verifyAgentChange(sessionId);
        if (!verification) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, verification);
      }

      if (req.method === 'POST' && /^\/v1\/agent\/sessions\/[^/]+\/complete$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const completion = this.repositorySession.completeAgentChange(sessionId);
        if (!completion) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, completion);
      }

      if (req.method === 'GET' && /^\/v1\/agent\/sessions\/[^/]+\/events$/.test(url.pathname)) {
        const sessionId = url.pathname.split('/')[4];
        const since = Number(url.searchParams.get('since') || 0);
        const events = this.repositorySession.listAgentEvents(sessionId, since);
        if (!events) return sendJson(res, 404, { error: 'Agent session not found' });
        return sendJson(res, 200, { events });
      }

      if (req.method === 'POST' && url.pathname === '/v1/sessions/complete') {
        const session = this.repositorySession.completeActiveSession();
        if (!session) return sendJson(res, 404, { error: 'No active change session' });
        return sendJson(res, 200, session);
      }

      if (req.method === 'POST' && url.pathname === '/v1/sessions/abandon') {
        const session = this.repositorySession.abandonActiveSession();
        if (!session) return sendJson(res, 404, { error: 'No active change session' });
        return sendJson(res, 200, session);
      }

      if (req.method === 'POST' && url.pathname === '/v1/analyze') {
        const body = await parseBody(req);
        const files = Array.isArray(body.files) ? body.files : [];
        const update = this.repositorySession.processRepositoryChange(files, { source: 'api' });
        return sendJson(res, 200, update);
      }

      if (req.method === 'POST' && url.pathname === '/v1/verify') {
        return sendJson(res, 200, this.repositorySession.verifyActiveEvidence());
      }

      if (req.method === 'POST' && url.pathname === '/v1/runtime/rescan') {
        return sendJson(res, 200, this.repositorySession.rescan());
      }

      if (req.method === 'POST' && url.pathname === '/v1/runtime/stop') {
        sendJson(res, 200, { ok: true, stopping: true });
        setTimeout(() => this.stop(), 20);
        return;
      }

      return sendJson(res, 404, { error: 'Not found' });
    });

    await new Promise((resolve) => {
      this.server.listen(this.port, this.host, resolve);
    });

    this.port = this.server.address().port;
    return this;
  }

  stop() {
    this.repositorySession.stopWatching();
    for (const res of this.subscribers) {
      try {
        res.end();
      } catch {
        // noop
      }
    }
    this.subscribers.clear();
    if (!this.server) return;
    const server = this.server;
    this.server = null;
    server.close();
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }
}

async function startRuntimeServer(rootDir, options = {}) {
  const runtimeServer = new RuntimeServer(rootDir, options);
  await runtimeServer.start();
  return runtimeServer;
}

module.exports = {
  RuntimeServer,
  startRuntimeServer
};

function toYaml(value, indent = 0) {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    return value.map((item) => `${pad}- ${typeof item === 'object' ? `\n${toYaml(item, indent + 2)}` : toYaml(item, 0)}`).join('\n');
  }
  return Object.entries(value).map(([key, entry]) => {
    if (entry && typeof entry === 'object') return `${pad}${key}:\n${toYaml(entry, indent + 2)}`;
    return `${pad}${key}: ${toYaml(entry, 0)}`;
  }).join('\n');
}
