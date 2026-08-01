const { createPlanReview } = require('../protocols/plan-review');

function reviewPlan({ plan, context }) {
  const requiredAdditions = [];
  if (!plan.files?.length) requiredAdditions.push('Declare planned files.');
  const touchesContracts = plan.files?.some((file) => /contract|manifest|schema|types?/i.test(file));
  if (touchesContracts) requiredAdditions.push('Validate downstream contract consumers.');
  const missingEvidence = (context.required_evidence || []).filter((evidence) => !plan.steps?.some((step) => JSON.stringify(step).includes(evidence) || /evidence/.test(step.action || '')));
  if (missingEvidence.length) requiredAdditions.push(`Include evidence steps: ${missingEvidence.join(', ')}`);
  const hasBlockingViolation = plan.steps?.some((step) => /new.*runtime|introduce.*runtime/i.test(JSON.stringify(step)));
  const result = hasBlockingViolation
    ? 'rejected'
    : requiredAdditions.length ? 'approved_with_requirements' : 'approved';
  const assurance = hasBlockingViolation ? 45 : Math.max(70, 96 - requiredAdditions.length * 8);
  return createPlanReview({
    result,
    plan_assurance: assurance,
    required_additions: requiredAdditions,
    sections: {
      architecture: hasBlockingViolation ? 'blocking_violation' : 'pass',
      contracts: touchesContracts ? 'review_required' : 'pass',
      evidence: missingEvidence.length ? 'required' : 'pass'
    }
  });
}

module.exports = {
  reviewPlan
};
