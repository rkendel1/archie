const { createChangeIntent } = require('../protocols/change-intent');

function understandIntent(input, model) {
  const intent = createChangeIntent(input);
  if (!intent.outcome) return intent;
  const mentionsRuntime = /runtime|worker|analytics/i.test(intent.outcome);
  const runtimeOwners = (model?.runtimes || []).filter((runtime) => /worker|analytics/i.test(runtime));
  const hasConstraintSignal = (intent.constraints || []).length > 0;
  const understood = mentionsRuntime || runtimeOwners.length > 0 || hasConstraintSignal;
  return {
    ...intent,
    status: understood ? 'understood' : 'declared',
    confidence: understood ? 0.91 : 0.8,
    relevant_capabilities: (model?.importantFiles || [])
      .filter((file) => /capability|service|feature/i.test(file.file))
      .slice(0, 3)
      .map((entry) => pathStem(entry.file)),
    potential_system_owners: runtimeOwners
  };
}

function pathStem(file) {
  return String(file || '').replace(/\.[^.]+$/, '').replace(/^.*\//, '');
}

module.exports = {
  understandIntent
};
