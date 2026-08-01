function architecturePolicy() {
  return {
    id: 'constraint.runtime.single-authority',
    domain: 'architecture',
    level: 'blocking',
    statement: 'Long-running analytics must use the canonical Worker Runtime.'
  };
}

module.exports = { architecturePolicy };
