function buildConstraints(model, intent = {}) {
  const constraints = [];
  const workerRuntime = (model.runtimes || []).find((runtime) => /worker/i.test(runtime));
  if (workerRuntime) {
    constraints.push({
      id: 'runtime-authority',
      domain: 'runtime',
      level: 'blocking',
      statement: 'Do not introduce another long-running analytics runtime.',
      source: 'confirmed architecture',
      confidence: 1,
      authority: workerRuntime
    });
  }
  if ((intent.constraints || []).length) {
    for (const item of intent.constraints) {
      const statement = typeof item === 'string' ? item : item.value;
      constraints.push({
        id: `intent-${constraints.length + 1}`,
        domain: typeof item === 'string' ? 'product' : (item.type || 'product'),
        level: 'warning',
        statement,
        source: 'agent intent',
        confidence: 0.9,
        authority: 'declared'
      });
    }
  }
  return constraints;
}

module.exports = {
  buildConstraints
};
