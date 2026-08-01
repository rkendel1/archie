#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {
  buildModel,
  saveModel,
  loadModel,
  writeDefaultConfig,
  writeWorkflow,
  listChangedFiles,
  computeImpact,
  checkModel,
  verifyEvidence,
  githubReport,
  modelPath,
  confirmUnderstanding,
  correctArchitecture,
  projectModelByLanguage
} = require('./model');
const { startRuntimeServer } = require('./runtime');
const { startLocalAgent } = require('./integrations/agent-adapter');
const { formatContextMarkdown } = require('./protocols/agent-context');

function print(obj) {
  process.stdout.write(`${typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)}\n`);
}

function fail(message, code = 1) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function repoRootFromArgs(args) {
  const idx = args.indexOf('--repo');
  if (idx !== -1 && args[idx + 1]) return path.resolve(args[idx + 1]);
  return process.cwd();
}

function argValue(args, name, fallback = null) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

function runtimePortFromArgs(args) {
  return Number(argValue(args, '--port', process.env.ARCHIE_RUNTIME_PORT || 4317));
}

function runtimeRequest({ port, method = 'GET', pathname, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data || '{}'));
        } catch {
          resolve({ error: data || `Invalid response from runtime API ${pathname}` });
        }

        function readJsonFile(filePath) {
          const abs = path.resolve(filePath);
          return JSON.parse(fs.readFileSync(abs, 'utf8'));
        }

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
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function command(args) {
  const cmd = args[0];
  const root = repoRootFromArgs(args);

  if (cmd === 'init') {
    writeDefaultConfig(root);
    const workflowPath = writeWorkflow(root);
    print({ ok: true, root, workflowPath, next: ['participant analyze --summary', 'participant watch'] });
    return;
  }

  if (cmd === 'analyze') {
    const languageFilter = argValue(args, '--language', null);
    const model = buildModel(root);
    saveModel(root, model);
    const projection = languageFilter ? projectModelByLanguage(model, languageFilter) : model;
    if (args.includes('--summary')) {
      const languages = projection.discovery.languages.map((entry) => `${entry.language} ${entry.percentage}%`);
      print({
        systemUnderstanding: {
          primaryApplication: path.basename(root),
          detectedArchitecture: projection.architecture,
          executionEnvironments: projection.runtimes,
          languages,
          analyzers: model.analyzers || [],
          importantFiles: projection.importantFiles.slice(0, 5),
          importantBoundaries: ['Application → Capability SDK', 'Capability → Runtime ABI', 'Runtime → Provider'],
          uncertainties: projection.uncertainties,
          confidence: `${projection.confidence}%`,
          systemStatus: projection.systemStatus || 'pending-review'
        }
      });
    } else {
      print({ ok: true, modelPath: modelPath(root), confidence: projection.confidence, language: languageFilter || 'all' });
    }
    return;
  }

  if (cmd === 'serve') {
    const port = runtimePortFromArgs(args);
    const server = await startRuntimeServer(root, { port });
    print([
      'Archie Live Intelligence Runtime',
      'Repository:',
      `  ${root}`,
      'Initial analysis:',
      '  Complete',
      'Model:',
      `  Version ${server.repositorySession.modelVersion}`,
      'Repository watch:',
      '  Active',
      'Local API:',
      `  ${server.baseUrl}`,
      'Event stream:',
      '  /v1/events',
      'Active change session:',
      `  ${server.repositorySession.activeChangeSession?.id || 'none'}`
    ].join('\n'));
    return;
  }

  if (cmd === 'analyzers') {
    const model = buildModel(root);
    saveModel(root, model);
    print({
      analyzers: (model.analyzers || []).map((analyzer) => ({
        name: analyzer.language === 'javascript/typescript' ? 'JavaScript / TypeScript' : 'Python',
        status: analyzer.status,
        incrementalAnalysis: analyzer.incrementalAnalysis
      }))
    });
    return;
  }

  if (cmd === 'watch') {
    if (args.includes('--once')) {
      const model = buildModel(root);
      saveModel(root, model);
      const changedFiles = listChangedFiles(root);
      const impact = computeImpact(model, changedFiles);
      print({ ok: true, changedFiles, impact, modelPath: modelPath(root) });
      return;
    }

    let busy = false;
    fs.watch(root, { recursive: true }, (_eventType, filename) => {
      if (busy || !filename) return;
      if (filename.startsWith('.git/') || filename.startsWith('node_modules/')) return;
      busy = true;
      try {
        const model = buildModel(root);
        saveModel(root, model);
        const impact = computeImpact(model, [filename.replace(/\\/g, '/')]);
        print({ event: 'change', file: filename, impact, confidence: model.confidence });
      } catch (e) {
        print({ event: 'error', message: e.message });
      } finally {
        setTimeout(() => {
          busy = false;
        }, 200);
      }
    });
    print({ ok: true, watching: root, hint: 'Use Ctrl+C to stop.' });
    return;
  }

  if (cmd === 'check') {
    const kind = args[1];
    const model = loadModel(root);
    const result = checkModel(model, kind);
    print(result);
    if (!result.ok) process.exit(2);
    return;
  }

  if (cmd === 'impact') {
    const model = loadModel(root);
    if (!model) fail('No system model found. Run participant analyze first.');
    const explicit = args.indexOf('--files');
    const files = explicit !== -1 && args[explicit + 1]
      ? args[explicit + 1].split(',').map((s) => s.trim()).filter(Boolean)
      : listChangedFiles(root);
    print(computeImpact(model, files));
    return;
  }

  if (cmd === 'verify') {
    const model = loadModel(root);
    if (!model) fail('No system model found. Run participant analyze first.');
    const changedFiles = args.includes('--changed') ? listChangedFiles(root) : [];
    const result = verifyEvidence(model, changedFiles);
    print(result);
    if (!result.ok) process.exit(3);
    return;
  }

  if (cmd === 'session') {
    const sub = args[1];
    const port = runtimePortFromArgs(args);
    try {
      if (sub === 'start') {
        const intent = argValue(args, '--intent', '');
        const result = await runtimeRequest({ port, method: 'POST', pathname: '/v1/sessions', body: { intent } });
        print(result);
        return;
      }
      if (sub === 'status') {
        const result = await runtimeRequest({ port, method: 'GET', pathname: '/v1/changes/active' });
        print(result);
        return;
      }
      if (sub === 'complete') {
        const result = await runtimeRequest({ port, method: 'POST', pathname: '/v1/sessions/complete' });
        print(result);
        return;
      }
      if (sub === 'abandon') {
        const result = await runtimeRequest({ port, method: 'POST', pathname: '/v1/sessions/abandon' });
        print(result);
        return;
      }
    } catch {
      fail(`Runtime API is not available on port ${port}. Start it with: participant serve --port ${port}`);
    }
    fail('Usage: participant session <start|status|complete|abandon> [--intent "..."] [--port <n>]');
  }

  if (cmd === 'agent') {
    const sub = args[1];
    const action = args[2];
    const port = runtimePortFromArgs(args);
    try {
      if (sub === 'discover') {
        const result = await runtimeRequest({ port, method: 'GET', pathname: '/v1/agent/protocol' });
        print([
          'ARCHIE AGENT PARTICIPATION',
          'Repository',
          result.repository?.id || root,
          'Runtime',
          'Active',
          'Agent protocol',
          result.protocol_version || '1.0',
          'Available services',
          '✓ System context',
          '✓ Change sessions',
          '✓ Plan review',
          '✓ Live impact',
          '✓ Constraints',
          '✓ Evidence reporting',
          '✓ Completion review',
          'Local endpoint',
          `http://127.0.0.1:${port}/v1/agent`
        ].join('\n'));
        return;
      }
      if (sub === 'start') {
        const name = argValue(args, '--name', 'Local Coding Agent');
        const adapter = startLocalAgent(name);
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: '/v1/agent/sessions',
          body: adapter
        });
        print(result);
        return;
      }
      if (sub === 'register') {
        const id = argValue(args, '--id', '');
        const name = argValue(args, '--name', id || 'Local Coding Agent');
        const capabilities = String(argValue(args, '--capabilities', '')).split(',').map((entry) => entry.trim()).filter(Boolean);
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: '/v1/agent/sessions',
          body: { id, name, capabilities }
        });
        print(result);
        return;
      }
      if (sub === 'context') {
        const sessionId = argValue(args, '--session', '');
        if (!sessionId) fail('Usage: participant agent context --session <agent_session_id> [--intent "..."] [--detail minimal|focused|comprehensive] [--format json|yaml|markdown|summary]');
        const declaredIntent = argValue(args, '--intent', '');
        if (declaredIntent) {
          await runtimeRequest({
            port,
            method: 'POST',
            pathname: `/v1/agent/sessions/${sessionId}/intent`,
            body: { intent: { outcome: declaredIntent } }
          });
        }
        const detail = argValue(args, '--detail', 'focused');
        const format = argValue(args, '--format', 'json').toLowerCase();
        const result = await runtimeRequest({
          port,
          method: 'GET',
          pathname: `/v1/agent/sessions/${sessionId}/context?detail=${encodeURIComponent(detail)}`
        });
        if (format === 'markdown') return print(formatContextMarkdown(result));
        if (format === 'yaml') return print(toYaml(result));
        if (format === 'summary') {
          return print({
            intent: result.intent,
            constraints: result.constraints?.map((entry) => entry.statement) || [],
            important_files: result.important_files?.map((entry) => entry.path) || [],
            required_evidence: result.required_evidence || []
          });
        }
        print(result);
        return;
      }
      if (sub === 'plan' && action === 'submit') {
        const sessionId = argValue(args, '--session', '');
        const file = argValue(args, '--file', '');
        if (!sessionId || !file) fail('Usage: participant agent plan submit --session <agent_session_id> --file <plan.json>');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/plans`,
          body: readJsonFile(file)
        });
        print(result);
        return;
      }
      if (sub === 'files' && action === 'declare') {
        const sessionId = argValue(args, '--session', '');
        const files = String(argValue(args, '--files', '')).split(',').map((entry) => entry.trim()).filter(Boolean);
        if (!sessionId || !files.length) fail('Usage: participant agent files declare --session <agent_session_id> --files f1,f2');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/files`,
          body: { files }
        });
        print(result);
        return;
      }
      if (sub === 'implementation' && action === 'report') {
        const sessionId = argValue(args, '--session', '');
        const file = argValue(args, '--file', '');
        if (!sessionId || !file) fail('Usage: participant agent implementation report --session <agent_session_id> --file <implementation.json>');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/implementation`,
          body: readJsonFile(file)
        });
        print(result);
        return;
      }
      if (sub === 'evidence' && action === 'submit') {
        const sessionId = argValue(args, '--session', '');
        const file = argValue(args, '--file', '');
        if (!sessionId || !file) fail('Usage: participant agent evidence submit --session <agent_session_id> --file <evidence.json>');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/evidence`,
          body: readJsonFile(file)
        });
        print(result);
        return;
      }
      if (sub === 'verify') {
        const sessionId = argValue(args, '--session', '');
        if (!sessionId) fail('Usage: participant agent verify --session <agent_session_id>');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/verify`
        });
        print(result);
        return;
      }
      if (sub === 'complete') {
        const sessionId = argValue(args, '--session', '');
        if (!sessionId) fail('Usage: participant agent complete --session <agent_session_id>');
        const result = await runtimeRequest({
          port,
          method: 'POST',
          pathname: `/v1/agent/sessions/${sessionId}/complete`
        });
        print(result);
        return;
      }
    } catch {
      fail(`Runtime API is not available on port ${port}. Start it with: participant serve --port ${port}`);
    }
    fail([
      'Usage:',
      'participant agent discover [--port <n>]',
      'participant agent start --name "<name>" [--port <n>]',
      'participant agent register --id <id> --name "<name>" --capabilities read,write,plan,verify [--port <n>]',
      'participant agent context --session <agent_session_id> [--intent "..."] [--detail <minimal|focused|comprehensive>] [--format <json|yaml|markdown|summary>] [--port <n>]',
      'participant agent plan submit --session <agent_session_id> --file <plan.json> [--port <n>]',
      'participant agent files declare --session <agent_session_id> --files f1,f2 [--port <n>]',
      'participant agent implementation report --session <agent_session_id> --file <implementation.json> [--port <n>]',
      'participant agent evidence submit --session <agent_session_id> --file <evidence.json> [--port <n>]',
      'participant agent verify --session <agent_session_id> [--port <n>]',
      'participant agent complete --session <agent_session_id> [--port <n>]'
    ].join('\n'));
  }

  if (cmd === 'status' && args.includes('--live')) {
    const port = runtimePortFromArgs(args);
    try {
      const status = await runtimeRequest({ port, method: 'GET', pathname: '/v1/status' });
      const intent = status.active_change?.intent?.description || 'Unknown';
      print([
        'ARCHIE LIVE STATUS',
        'Repository',
        status.repository.id,
        'Model',
        `Version ${status.model.version}`,
        `Updated ${status.model.updated_at || 'unknown'}`,
        'Repository watch',
        status.repository_watch === 'active' ? 'Active' : 'Inactive',
        'Current change',
        intent,
        'Changed files',
        String(status.active_change?.files?.length || 0),
        'System impact',
        `${status.active_change?.system_impact?.capabilities || 0} capabilities`,
        `${status.active_change?.system_impact?.runtimes || 0} runtimes`,
        `${status.active_change?.system_impact?.contracts || 0} contracts`,
        `${status.active_change?.system_impact?.important_files || 0} important files`,
        'Evidence',
        `${status.evidence.valid} valid`,
        `${status.evidence.stale} stale`,
        `${status.evidence.missing} missing`,
        'Assurance',
        `${status.assurance.score}%`,
        status.assurance.status.replace(/_/g, ' ')
      ].join('\n'));
      return;
    } catch {
      fail(`Runtime API is not available on port ${port}. Start it with: participant serve --port ${port}`);
    }
  }

  if (cmd === 'report') {
    const formatIdx = args.indexOf('--format');
    const format = formatIdx !== -1 ? args[formatIdx + 1] : 'json';
    const model = loadModel(root);
    if (!model) fail('No system model found. Run participant analyze first.');
    const impact = computeImpact(model, listChangedFiles(root));
    const verification = verifyEvidence(model, impact.changedFiles);
    if (format === 'github') return print(githubReport(model, impact, verification));
    print({ model, impact, verification });
    return;
  }

  if (cmd === 'confirm') {
    const result = confirmUnderstanding(root);
    print({ ok: true, result });
    return;
  }

  if (cmd === 'correct') {
    const correction = args.slice(1).join(' ').trim();
    if (!correction) fail('Provide correction text, e.g. participant correct "Use Worker Runtime for analytics"');
    const result = correctArchitecture(root, correction);
    print({ ok: true, result });
    return;
  }

  print({
    usage: [
      'participant init [--repo <path>]',
      'participant analyze [--repo <path>] [--summary] [--ci] [--language <name>]',
      'participant analyzers [--repo <path>]',
      'participant watch [--repo <path>] [--once]',
      'participant check <architecture|contracts|capabilities> [--repo <path>]',
      'participant impact [--repo <path>] [--files f1,f2]',
      'participant verify [--repo <path>] [--changed]',
      'participant report [--repo <path>] [--format github|json]',
      'participant confirm [--repo <path>]',
      'participant correct <text> [--repo <path>]',
      'participant serve [--repo <path>] [--port <n>]',
      'participant status --live [--port <n>]',
      'participant session start [--intent "..."] [--port <n>]',
      'participant session status [--port <n>]',
      'participant session complete [--port <n>]',
      'participant session abandon [--port <n>]',
      'participant agent discover [--port <n>]',
      'participant agent start --name "<name>" [--port <n>]',
      'participant agent register --id <id> --name "<name>" --capabilities read,write,plan,verify [--port <n>]',
      'participant agent context --session <agent_session_id> [--intent "..."] [--detail <minimal|focused|comprehensive>] [--format <json|yaml|markdown|summary>] [--port <n>]',
      'participant agent plan submit --session <agent_session_id> --file <plan.json> [--port <n>]',
      'participant agent files declare --session <agent_session_id> --files f1,f2 [--port <n>]',
      'participant agent implementation report --session <agent_session_id> --file <implementation.json> [--port <n>]',
      'participant agent evidence submit --session <agent_session_id> --file <evidence.json> [--port <n>]',
      'participant agent verify --session <agent_session_id> [--port <n>]',
      'participant agent complete --session <agent_session_id> [--port <n>]'
    ]
  });
}

if (require.main === module) {
  command(process.argv.slice(2)).catch((error) => fail(error.message));
}

module.exports = { command };
