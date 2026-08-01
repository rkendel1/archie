const { evaluateTransition } = require('./gates');

function evaluateChangeTransition(input = {}) {
  return evaluateTransition(input);
}

module.exports = {
  evaluateChangeTransition
};
