const PRIORITY_WEIGHTS = {
  informational: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5
};

function comparePriority(left = 'low', right = 'low') {
  return (PRIORITY_WEIGHTS[right] || 0) - (PRIORITY_WEIGHTS[left] || 0);
}

module.exports = {
  PRIORITY_WEIGHTS,
  comparePriority
};
