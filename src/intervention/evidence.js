function suggestEvidence(interventionType = '') {
  if (/CONTRACT|RUNTIME/.test(interventionType)) return ['contract-test', 'integration-test'];
  if (/EVIDENCE|VERIFICATION/.test(interventionType)) return ['verification-run', 'targeted-test'];
  if (/PLAN|IMPLEMENTATION|UNDECLARED/.test(interventionType)) return ['change-review'];
  return ['targeted-test'];
}

module.exports = {
  suggestEvidence
};
