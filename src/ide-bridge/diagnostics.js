function normalizeDiagnostics(entries = []) {
  return entries
    .map((entry) => ({
      source: String(entry.source || 'unknown').trim(),
      severity: String(entry.severity || 'info').trim(),
      file: String(entry.file || '').trim(),
      message: String(entry.message || '').trim()
    }))
    .filter((entry) => entry.file && entry.message);
}

module.exports = { normalizeDiagnostics };
