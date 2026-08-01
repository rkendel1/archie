#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
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
  correctArchitecture
} = require('./model');

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

function command(args) {
  const cmd = args[0];
  const root = repoRootFromArgs(args);

  if (cmd === 'init') {
    writeDefaultConfig(root);
    const workflowPath = writeWorkflow(root);
    print({ ok: true, root, workflowPath, next: ['participant analyze --summary', 'participant watch'] });
    return;
  }

  if (cmd === 'analyze') {
    const model = buildModel(root);
    saveModel(root, model);
    if (args.includes('--summary')) {
      print({
        systemUnderstanding: {
          primaryApplication: path.basename(root),
          detectedArchitecture: model.architecture,
          executionEnvironments: model.runtimes,
          importantFiles: model.importantFiles.slice(0, 5),
          importantBoundaries: ['Application → Capability SDK', 'Capability → Runtime ABI', 'Runtime → Provider'],
          uncertainties: model.uncertainties,
          confidence: `${model.confidence}%`,
          systemStatus: model.systemStatus || 'pending-review'
        }
      });
    } else {
      print({ ok: true, modelPath: modelPath(root), confidence: model.confidence });
    }
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
      'participant analyze [--repo <path>] [--summary] [--ci]',
      'participant watch [--repo <path>] [--once]',
      'participant check <architecture|contracts|capabilities> [--repo <path>]',
      'participant impact [--repo <path>] [--files f1,f2]',
      'participant verify [--repo <path>] [--changed]',
      'participant report [--repo <path>] [--format github|json]',
      'participant confirm [--repo <path>]',
      'participant correct <text> [--repo <path>]'
    ]
  });
}

if (require.main === module) command(process.argv.slice(2));

module.exports = { command };
