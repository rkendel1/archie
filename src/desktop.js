#!/usr/bin/env node
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
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

function page() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Archie Desktop MVP</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 20px; max-width: 1200px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    input, button, textarea { padding: 8px; font-size: 14px; }
    input { min-width: 560px; }
    pre { background: #111827; color: #e5e7eb; padding: 12px; border-radius: 8px; overflow: auto; }
  </style>
</head>
<body>
  <h1>Archie Desktop MVP</h1>
  <p>Open local repository · analyze · watch · impact · confirm/correct · generate CI</p>

  <div class="row">
    <input id="repo" placeholder="/absolute/path/to/repository" />
    <button onclick="openRepo()">Open local repository</button>
    <button onclick="analyzeRepo()">Analyze</button>
    <button onclick="watchToggle()" id="watchBtn">Start watch</button>
    <button onclick="generateWorkflow()">Generate GitHub Actions</button>
  </div>

  <div class="row">
    <button onclick="runCheck('architecture')">Check architecture</button>
    <button onclick="runCheck('contracts')">Check contracts</button>
    <button onclick="runCheck('capabilities')">Check changed-capabilities</button>
    <button onclick="verifyEvidence()">Verify evidence requirements</button>
    <button onclick="runImpact()">Show change impact</button>
  </div>

  <div class="row">
    <button onclick="confirmUnderstanding()">Confirm understanding</button>
    <input id="correction" placeholder="Correct architecture (one line)" />
    <button onclick="correctArchitecture()">Submit correction</button>
  </div>

  <h2>System Understanding</h2>
  <pre id="understanding">No repository loaded.</pre>

  <h2>Live Events</h2>
  <pre id="events"></pre>

<script>
let currentRepo = '';
let es = null;

async function api(path, method='GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

function write(id, data) {
  document.getElementById(id).textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function openRepo() {
  currentRepo = document.getElementById('repo').value.trim();
  const result = await api('/api/open-repo', 'POST', { repo: currentRepo });
  write('understanding', result);
}

async function analyzeRepo() {
  const result = await api('/api/analyze', 'POST', { repo: currentRepo });
  write('understanding', result);
}

function watchToggle() {
  if (es) {
    es.close();
    es = null;
    document.getElementById('watchBtn').textContent = 'Start watch';
    return;
  }
  es = new EventSource('/api/watch?repo=' + encodeURIComponent(currentRepo));
  es.onmessage = (evt) => {
    const old = document.getElementById('events').textContent;
    document.getElementById('events').textContent = evt.data + '\n' + old;
  };
  document.getElementById('watchBtn').textContent = 'Stop watch';
}

async function runImpact() {
  const result = await api('/api/impact', 'POST', { repo: currentRepo });
  write('understanding', result);
}

async function runCheck(kind) {
  const result = await api('/api/check', 'POST', { repo: currentRepo, kind });
  write('understanding', result);
}

async function verifyEvidence() {
  const result = await api('/api/verify', 'POST', { repo: currentRepo });
  write('understanding', result);
}

async function generateWorkflow() {
  const result = await api('/api/generate-workflow', 'POST', { repo: currentRepo });
  write('understanding', result);
}

async function confirmUnderstanding() {
  const result = await api('/api/confirm', 'POST', { repo: currentRepo });
  write('understanding', result);
}

async function correctArchitecture() {
  const correction = document.getElementById('correction').value.trim();
  const result = await api('/api/correct', 'POST', { repo: currentRepo, correction });
  write('understanding', result);
}
</script>
</body>
</html>`;
}

function startDesktopServer(port = Number(process.env.PORT || 43111)) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(page());
      return;
    }

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
      const model = buildModel(repo);
      saveModel(repo, model);
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
    process.stdout.write(`Archie desktop MVP running at http://localhost:${port}\n`);
  });

  return server;
}

if (require.main === module) startDesktopServer();

module.exports = { startDesktopServer };
