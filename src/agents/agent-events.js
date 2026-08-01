function mapEventType(type) {
  const map = {
    'change-session.updated': 'agent.change.observed',
    'impact.updated': 'agent.impact.updated',
    'contract.changed': 'agent.contract.affected',
    'evidence.invalidated': 'agent.evidence.stale',
    'assurance.updated': 'agent.assurance.updated'
  };
  return map[type] || type;
}

module.exports = {
  mapEventType
};
