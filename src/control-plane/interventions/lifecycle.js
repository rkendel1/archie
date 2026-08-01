const ALLOWED = {
  open: ['acknowledged', 'in-progress', 'resolved', 'waived', 'escalated', 'superseded'],
  acknowledged: ['in-progress', 'resolved', 'waived', 'escalated', 'superseded'],
  'in-progress': ['resolved', 'waived', 'escalated', 'superseded'],
  resolved: [],
  waived: [],
  escalated: ['resolved', 'waived', 'superseded'],
  superseded: []
};

function canTransitionIntervention(from, to) {
  return (ALLOWED[from] || []).includes(to);
}

module.exports = {
  canTransitionIntervention
};
