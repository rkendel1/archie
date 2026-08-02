function normalizeFilesystemEvents(entries = []) {
  return entries
    .map((entry) => ({
      type: String(entry.type || '').trim(),
      path: String(entry.path || '').trim(),
      attribution: String(entry.attribution || 'unknown').trim(),
      confidence: String(entry.confidence || 'unknown').trim()
    }))
    .filter((entry) => entry.type && entry.path);
}

module.exports = { normalizeFilesystemEvents };
