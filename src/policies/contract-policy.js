function contractPolicy() {
  return {
    id: 'constraint.contract.consumer-review',
    domain: 'contract',
    level: 'review_required',
    statement: 'Canonical contract changes require downstream consumer validation.'
  };
}

module.exports = { contractPolicy };
