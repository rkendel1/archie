const { createChangePlan } = require('../protocols/change-plan');
const { reviewPlan } = require('./plan-reviewer');

function submitPlan(input, context) {
  const plan = createChangePlan(input);
  const review = reviewPlan({ plan, context });
  plan.status = review.result;
  plan.review = review;
  plan.updated_at = new Date().toISOString();
  return plan;
}

module.exports = {
  submitPlan
};
