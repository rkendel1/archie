function evaluateBehavior({ assurance = {}, verification = {} } = {}) {
  if (verification.ok === false) return { status: 'WARNING', details: verification.missing || ['Evidence verification failed'] };
  if (Number(assurance.score || 0) >= 80) return { status: 'PASS', details: ['Behavior confidence is strong'] };
  return { status: 'NOT VERIFIED', details: ['Behavior assurance requires additional evidence'] };
}

module.exports = {
  evaluateBehavior
};
