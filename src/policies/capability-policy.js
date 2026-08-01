function capabilityPolicy() {
  return {
    id: 'constraint.capability.reuse',
    domain: 'capability',
    level: 'recommendation',
    statement: 'Prefer existing capabilities before introducing new ones.'
  };
}

module.exports = { capabilityPolicy };
