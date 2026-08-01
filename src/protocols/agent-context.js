function formatContextMarkdown(context) {
  const lines = [
    '# Archie System Context',
    '## Intended Outcome',
    context.intent?.outcome || 'Not provided',
    '## Confirmed Architecture'
  ];
  for (const item of context.system?.architecture || []) lines.push(`- ${item.name}: ${item.status}`);
  lines.push('## Reuse Before Building');
  for (const capability of context.reusable_capabilities || []) lines.push(`- ${capability}`);
  lines.push('## Constraints');
  for (const constraint of context.constraints || []) lines.push(`- ${constraint.statement}`);
  lines.push('## Important Files');
  for (const file of context.important_files || []) lines.push(`- \`${file.path}\` ${file.role}`);
  lines.push('## Required Evidence');
  for (const evidence of context.required_evidence || []) lines.push(`- ${evidence}`);
  return lines.join('\n');
}

module.exports = {
  formatContextMarkdown
};
