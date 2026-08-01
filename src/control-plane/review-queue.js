const { buildReviewQueue } = require('../review/queue');

function evaluateReviewQueue(input = {}) {
  return buildReviewQueue(input);
}

module.exports = {
  evaluateReviewQueue
};
