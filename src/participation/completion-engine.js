const { createCompletionReport } = require('../protocols/completion-report');

function reviewCompletion({ session, verification }) {
  const required = session.required_evidence?.length || 0;
  const current = Math.max(0, required - (verification?.missing?.length || 0));
  const result = verification?.ok ? 'ready_for_review' : 'review_required';
  return createCompletionReport({
    intent: session.intent?.status || 'declared',
    plan: session.plans?.length ? 'approved' : 'review_required',
    implementation: session.implementation_reports?.length ? 'observed' : 'implementation_complete',
    evidence: { required, current },
    assurance: session.assurance?.score || 0,
    result
  });
}

module.exports = {
  reviewCompletion
};
