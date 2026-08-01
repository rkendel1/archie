function defaultCoordinationOptions() {
  return [
    { id: 'assign-ownership', label: 'Assign ownership' },
    { id: 'split-file-scope', label: 'Split file scope' },
    { id: 'split-capability-scope', label: 'Split capability scope' },
    { id: 'split-contract-scope', label: 'Split contract scope' },
    { id: 'pair-implementation', label: 'Pair on implementation' },
    { id: 'convert-to-reviewer', label: 'Convert one participant to reviewer' },
    { id: 'withdraw-work-claim', label: 'Withdraw a work claim' },
    { id: 'escalate-human-decision', label: 'Escalate to human decision' }
  ];
}

module.exports = {
  defaultCoordinationOptions
};
