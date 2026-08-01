function evidencePolicy() {
  return {
    id: 'constraint.evidence.required',
    domain: 'evidence',
    level: 'warning',
    statement: 'Implementations are incomplete until required evidence is current.'
  };
}

module.exports = { evidencePolicy };
