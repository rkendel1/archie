const crypto = require('node:crypto');

function buildRequirements({ changeId = null, evaluations = [], existing = [] }) {
  const requirements = [];
  const now = new Date().toISOString();
  const openExisting = (existing || []).filter((entry) => ['open', 'in-progress'].includes(entry.status));
  requirements.push(...openExisting);

  for (const evaluation of evaluations) {
    if (evaluation.status !== 'violated' && evaluation.status !== 'uncertain') continue;
    for (const effect of evaluation.effects || []) {
      const type = effectToRequirementType(effect.type);
      if (!type) continue;
      if (requirements.some((entry) => entry.type === type && entry.reason === (evaluation.findings[0]?.reason || evaluation.policy.name) && entry.status === 'open')) continue;
      requirements.push({
        id: `requirement_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
        changeId,
        source: 'policy',
        policyId: evaluation.policyId,
        type,
        status: 'open',
        appliesTo: {
          participants: unique(flattenParticipants(evaluation.findings || [])),
          capabilities: [],
          runtimes: [],
          contracts: [],
          files: []
        },
        reason: evaluation.findings[0]?.reason || `${evaluation.policy.name} requires ${type}`,
        evidence: evaluation.evidence || [],
        createdAt: now
      });
    }
  }

  return requirements;
}

function effectToRequirementType(effectType) {
  const mapping = {
    REQUIRE_ACKNOWLEDGEMENT: 'acknowledgement',
    REQUIRE_COORDINATION: 'coordination',
    REQUIRE_CONTEXT_REFRESH: 'context-refresh',
    REQUIRE_EVIDENCE: 'evidence',
    REQUIRE_DECISION: 'decision',
    ESCALATE_REVIEW: 'review',
    BLOCK_STATE_TRANSITION: 'verification',
    PUBLISH_PARTICIPANT_UPDATE: null,
    INVALIDATE_CONTEXT: null,
    CREATE_INTERVENTION: null
  };
  return mapping[effectType] || null;
}

function flattenParticipants(findings = []) {
  return findings.flatMap((finding) => finding.affectedParticipants || []);
}

function unique(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

module.exports = {
  buildRequirements
};
