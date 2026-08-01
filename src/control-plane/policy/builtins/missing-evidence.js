const { hasMissingEvidence } = require('../conditions');

function missingEvidencePolicy() {
  return {
    id: 'missing-evidence',
    name: 'Evidence Freshness Policy',
    description: 'Evidence is only valid for the system state it verifies.',
    domain: 'assurance',
    priority: 'high',
    appliesTo: { evidence: 'all' },
    effects: [
      { type: 'CREATE_INTERVENTION', severity: 'medium' },
      { type: 'REQUIRE_EVIDENCE', requirements: [{ type: 'verification', name: 'fresh-evidence' }] },
      { type: 'PUBLISH_PARTICIPANT_UPDATE' },
      { type: 'BLOCK_STATE_TRANSITION', transition: 'complete' }
    ],
    evaluate(snapshot = {}) {
      if (!hasMissingEvidence(snapshot)) return { status: 'satisfied', findings: [], confidence: 0.92, evidence: [], effects: [] };
      const entries = (snapshot.evidenceState || []).filter((entry) => ['missing', 'stale', 'failed'].includes(entry.status));
      return {
        status: 'violated',
        confidence: 0.9,
        findings: entries.map((entry) => ({
          observed: `evidence-${entry.status}`,
          reason: entry.reason?.summary || 'Evidence is stale or missing',
          affectedParticipants: ['participant-archie'],
          affectedChangeState: 'evidence-required'
        })),
        evidence: entries.map((entry) => ({ id: entry.id, kind: 'evidence', confidence: 0.9 })),
        effects: this.effects
      };
    }
  };
}

module.exports = {
  missingEvidencePolicy
};
