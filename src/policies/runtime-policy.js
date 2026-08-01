function runtimePolicy() {
  return {
    id: 'constraint.runtime.registration',
    domain: 'runtime',
    level: 'warning',
    statement: 'Runtime-facing changes should preserve canonical runtime registration.'
  };
}

module.exports = { runtimePolicy };
