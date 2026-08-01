const { evaluateInterventions } = require('./evaluator');

function interventionEngine(input = {}) {
  const interventions = evaluateInterventions(input);
  const open = interventions.filter((item) => item.status === 'open');
  const high = open.filter((item) => item.severity === 'high').length;
  const medium = open.filter((item) => item.severity === 'medium').length;
  const low = open.filter((item) => item.severity === 'low').length;
  return {
    interventions,
    summary: {
      open: open.length,
      high,
      medium,
      low
    }
  };
}

module.exports = {
  interventionEngine
};
