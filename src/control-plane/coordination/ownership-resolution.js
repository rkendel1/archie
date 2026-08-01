function suggestOwnershipResolution(conflict = {}) {
  const [first, second] = conflict.participants || [];
  return {
    strategy: 'owner-and-reviewer',
    summary: `${first || 'Participant A'} implements, ${second || 'Participant B'} reviews compatibility`,
    assignments: [
      { participantId: first || null, role: 'implementation-owner' },
      { participantId: second || null, role: 'compatibility-reviewer' }
    ]
  };
}

module.exports = {
  suggestOwnershipResolution
};
