const SUPPORTED_CAPABILITIES = [
  'read_system',
  'read_context',
  'create_change',
  'join_change',
  'submit_intent',
  'submit_plan',
  'read_constraints',
  'declare_files',
  'write_repository',
  'observe_changes',
  'submit_implementation',
  'submit_evidence',
  'request_verification',
  'complete_change',
  'admin'
];

const CAPABILITY_ALIASES = {
  read: ['read_system', 'read_context'],
  write: ['write_repository'],
  plan: ['submit_plan'],
  verify: ['request_verification']
};

function normalizeCapabilities(input = []) {
  const raw = Array.isArray(input)
    ? input
    : String(input || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  const set = new Set();
  for (const capability of raw) {
    if (CAPABILITY_ALIASES[capability]) {
      for (const expanded of CAPABILITY_ALIASES[capability]) set.add(expanded);
      continue;
    }
    if (SUPPORTED_CAPABILITIES.includes(capability)) set.add(capability);
  }
  if (!set.size) return [...SUPPORTED_CAPABILITIES];
  return Array.from(set).sort();
}

module.exports = {
  SUPPORTED_CAPABILITIES,
  normalizeCapabilities
};
