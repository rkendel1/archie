function evaluateRules(context = {}) {
  const findings = [];
  const proposal = context.proposal || {};
  const impact = context.impact || { affected: { runtimes: [], contracts: [], capabilities: 0 } };
  const session = context.changeSession || {};
  const evidence = context.evidence || {};

  const declaredFiles = new Set(proposal.scope?.declaredFiles || []);
  const observedFiles = session.files || [];
  const undeclared = observedFiles.filter((file) => !declaredFiles.has(file));
  if (undeclared.length) {
    findings.push({
      type: 'UNDECLARED_FILE',
      severity: 'high',
      message: `${undeclared[0]} modifies system scope outside declared files.`,
      reasoning: [{ kind: 'file-scope', source: undeclared[0], relationship: 'not-declared' }],
      requiredActions: ['Update the change declaration and re-run change review.'],
      confidence: 0.93
    });
  }

  if (impact.affected.contracts?.length) {
    findings.push({
      type: 'CONTRACT_BREAK',
      severity: 'high',
      message: 'The proposed change modifies a public runtime contract.',
      reasoning: impact.affected.contracts.map((file) => ({ kind: 'contract-dependency', source: file, relationship: 'changed' })),
      affectedContracts: impact.affected.contracts,
      requiredActions: ['Add compatibility evidence', 'Run the cross-runtime contract verification'],
      confidence: 0.91
    });
  }

  if (impact.affected.runtimes?.length && proposal.constraints?.preserveRuntimeCompatibility) {
    findings.push({
      type: 'RUNTIME_CONFLICT',
      severity: 'medium',
      message: 'Runtime-affecting files changed while runtime compatibility is constrained.',
      reasoning: impact.affected.runtimes.map((runtime) => ({ kind: 'runtime-impact', target: runtime, relationship: 'affected' })),
      requiredActions: ['Verify runtime compatibility across affected runtimes'],
      confidence: 0.84
    });
  }

  if ((evidence.stale || 0) + (evidence.missing || 0) > 0) {
    findings.push({
      type: 'EVIDENCE_INVALIDATED',
      severity: 'medium',
      message: 'Existing evidence is stale or missing for the active change.',
      reasoning: [{ kind: 'evidence-state', source: 'repository-session', relationship: 'invalidated' }],
      requiredActions: ['Re-run required verification evidence'],
      confidence: 0.87
    });
  }

  if (proposal.plan?.length) {
    const planFiles = new Set();
    for (const step of proposal.plan) {
      for (const file of step.files || []) planFiles.add(file);
    }
    const offPlan = observedFiles.filter((file) => planFiles.size > 0 && !planFiles.has(file));
    if (offPlan.length) {
      findings.push({
        type: 'PLAN_DRIFT',
        severity: 'medium',
        message: 'Observed implementation exceeds the declared engineering plan.',
        reasoning: offPlan.map((file) => ({ kind: 'plan-drift', source: file, relationship: 'out-of-plan' })),
        requiredActions: ['Update plan steps to include new implementation scope'],
        confidence: 0.82
      });
    }
  }

  if (proposal.constraints?.preserveContracts && impact.affected.contracts?.length) {
    findings.push({
      type: 'IMPLEMENTATION_DRIFT',
      severity: 'high',
      message: 'Implementation conflicts with preserveContracts constraint.',
      reasoning: impact.affected.contracts.map((file) => ({ kind: 'constraint-violation', source: file, relationship: 'preserveContracts' })),
      requiredActions: ['Add compatibility adapter or adjust declared constraints'],
      confidence: 0.9
    });
  }

  if ((impact.affected.runtimes?.length || 0) + (impact.affected.contracts?.length || 0) >= 2) {
    findings.push({
      type: 'HIGH_IMPACT_CHANGE',
      severity: 'medium',
      message: 'Change affects multiple runtime or contract surfaces.',
      reasoning: [{ kind: 'impact-summary', source: 'impact', relationship: 'multi-surface' }],
      requiredActions: ['Implement in constrained order and verify incrementally'],
      confidence: 0.78
    });
  }

  if ((context.model?.uncertainties || []).length) {
    findings.push({
      type: 'UNCERTAIN_SYSTEM_AREA',
      severity: 'low',
      message: 'Model contains uncertain areas relevant to this change.',
      reasoning: (context.model.uncertainties || []).slice(0, 2).map((entry) => ({ kind: 'uncertainty', source: entry, relationship: 'model-gap' })),
      requiredActions: ['Collect stronger verification evidence in uncertain areas'],
      confidence: 0.65
    });
  }

  if ((session.verification?.ok === false || session.verification === null) && observedFiles.length) {
    findings.push({
      type: 'VERIFICATION_REQUIRED',
      severity: 'medium',
      message: 'Change cannot be completed without successful verification evidence.',
      reasoning: [{ kind: 'verification-state', source: 'change-session', relationship: 'required' }],
      requiredActions: ['Run verification for affected capabilities and contracts'],
      confidence: 0.88
    });
  }

  return findings;
}

module.exports = {
  evaluateRules
};
