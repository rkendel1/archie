function buildConstraints(proposal = {}, interventions = []) {
  const output = [];
  if (proposal.constraints?.preserveContracts) output.push('Maintain existing contract compatibility');
  if (proposal.constraints?.preserveRuntimeCompatibility) output.push('Preserve runtime compatibility across affected runtimes');
  if (proposal.constraints?.avoidArchitectureChanges) output.push('Do not introduce a new runtime architecture');
  for (const intervention of interventions) {
    if (intervention.severity === 'high') output.push(intervention.message);
  }
  return Array.from(new Set(output));
}

module.exports = {
  buildConstraints
};
