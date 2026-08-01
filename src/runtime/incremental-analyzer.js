const path = require('node:path');
const { buildModel } = require('../model');

const FULL_RESCAN_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.archie/config.json'
]);

const INCREMENTAL_EXTENSIONS = new Set([
  '.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx', '.json', '.yml', '.yaml', '.rs', '.go', '.py', '.java'
]);

function resolveAnalysisMode(changedFiles) {
  for (const file of changedFiles) {
    const normalized = String(file || '').replace(/\\/g, '/');
    if (FULL_RESCAN_FILES.has(normalized)) {
      return { mode: 'full', fallback_reason: 'configuration_changed' };
    }
    const extension = path.extname(normalized).toLowerCase();
    if (extension && !INCREMENTAL_EXTENSIONS.has(extension)) {
      return { mode: 'full', fallback_reason: 'unsupported_file_type' };
    }
  }
  return { mode: 'incremental', fallback_reason: null };
}

function analyzeChange(rootDir, changedFiles) {
  const mode = resolveAnalysisMode(changedFiles);
  const model = buildModel(rootDir);
  return {
    model,
    mode: mode.mode,
    fallback_reason: mode.fallback_reason
  };
}

module.exports = {
  analyzeChange
};
