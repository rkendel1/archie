function createPlanReview(review = {}) {
  return {
    result: review.result || 'approved',
    plan_assurance: Number(review.plan_assurance || 0),
    required_additions: Array.isArray(review.required_additions) ? review.required_additions : [],
    sections: review.sections || {}
  };
}

module.exports = {
  createPlanReview
};
