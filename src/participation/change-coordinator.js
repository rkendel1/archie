function evaluateDeclaredFiles({ declaredFiles = [], observedFiles = [] }) {
  const declared = new Set(declaredFiles);
  const observed = new Set(observedFiles);
  return {
    declared_files: Array.from(declared).sort(),
    actual_files: Array.from(observed).sort(),
    unexpected_files: Array.from(observed).filter((file) => !declared.has(file)).sort()
  };
}

module.exports = {
  evaluateDeclaredFiles
};
