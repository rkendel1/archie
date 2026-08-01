const { createImplementationReport } = require('../protocols/implementation-report');

function observeImplementation(input = {}, observedFiles = []) {
  const report = createImplementationReport(input);
  const reported = new Set(report.changes.map((entry) => entry.file));
  report.observed_mismatch = observedFiles.filter((file) => !reported.has(file));
  return report;
}

module.exports = {
  observeImplementation
};
