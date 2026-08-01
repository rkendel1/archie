function createImplementationReport(input = {}) {
  return {
    status: input.status || 'implemented',
    summary: input.summary || '',
    changes: Array.isArray(input.changes) ? input.changes : [],
    decisions: Array.isArray(input.decisions) ? input.decisions : [],
    known_limitations: Array.isArray(input.known_limitations) ? input.known_limitations : [],
    submitted_at: new Date().toISOString()
  };
}

module.exports = {
  createImplementationReport
};
