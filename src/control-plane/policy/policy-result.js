function createPolicyEvaluation(policy, input = {}) {
  const result = policy.evaluate(input) || {};
  return {
    policyId: policy.id,
    status: result.status || 'not-applicable',
    findings: result.findings || [],
    confidence: Number(result.confidence ?? 0),
    evidence: result.evidence || [],
    effects: result.effects || policy.effects || [],
    evaluatedAt: new Date().toISOString(),
    policy: {
      id: policy.id,
      name: policy.name,
      description: policy.description,
      domain: policy.domain,
      priority: policy.priority
    }
  };
}

module.exports = {
  createPolicyEvaluation
};
