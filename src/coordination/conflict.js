function classifyConflict(conflict = {}) {
  const fileOverlap = conflict.overlap?.files?.length || 0;
  const contractOverlap = conflict.overlap?.contracts?.length || 0;
  const runtimeOverlap = conflict.overlap?.runtimes?.length || 0;
  const severity = fileOverlap || contractOverlap ? 'high' : runtimeOverlap ? 'medium' : 'low';
  return {
    ...conflict,
    severity
  };
}

module.exports = {
  classifyConflict
};
