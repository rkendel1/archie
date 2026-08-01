const crypto = require('node:crypto');

function buildInterventions({ evaluations = [], activeChangeId = null, existing = [] }) {
  const existingByKey = new Map((existing || []).map((entry) => [`${entry.policyId}:${entry.finding}`, entry]));
  const created = [...(existing || []).filter((entry) => ['resolved', 'waived', 'superseded'].includes(entry.status))];
  for (const evaluation of evaluations) {
    if (evaluation.status !== 'violated' && evaluation.status !== 'uncertain') continue;
    for (const finding of evaluation.findings || []) {
      const findingKey = `${evaluation.policyId}:${finding.observed}:${finding.reason}`;
      const previous = existingByKey.get(`${evaluation.policyId}:${finding.reason}`) || existingByKey.get(findingKey);
      if (previous && ['open', 'acknowledged', 'in-progress', 'escalated'].includes(previous.status)) {
        created.push(previous);
        continue;
      }
      created.push({
        id: `intervention_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        changeId: activeChangeId,
        policyId: evaluation.policyId,
        type: String(finding.observed || 'policy-violation').toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        severity: severityForEvaluation(evaluation),
        status: 'open',
        finding: finding.observed || 'policy-violation',
        reason: finding.reason || 'Policy violated',
        requiredActions: [],
        affectedParticipants: finding.affectedParticipants || [],
        evidence: evaluation.evidence || [],
        confidence: evaluation.confidence,
        createdAt: new Date().toISOString(),
        history: [{ event: 'open', at: new Date().toISOString() }]
      });
    }
  }
  return created;
}

function severityForEvaluation(evaluation = {}) {
  const priority = evaluation.policy?.priority || 'medium';
  if (priority === 'critical') return 'critical';
  if (priority === 'high') return 'high';
  if (priority === 'medium') return 'medium';
  if (priority === 'low') return 'low';
  return 'informational';
}

module.exports = {
  buildInterventions
};
