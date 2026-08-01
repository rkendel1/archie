function buildRequiredEvidence(proposal = {}, interventions = []) {
  const required = new Set(proposal.constraints?.requiredEvidence || []);
  for (const intervention of interventions) {
    for (const item of intervention.suggestedEvidence || []) required.add(item);
  }
  if (!required.size) required.add('targeted-test');
  return Array.from(required);
}

module.exports = {
  buildRequiredEvidence
};
