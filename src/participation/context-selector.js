function selectContext(model, detail = 'focused') {
  const level = String(detail || 'focused').toLowerCase();
  const importantFileLimit = level === 'minimal' ? 3 : level === 'comprehensive' ? 12 : 6;
  const contractsLimit = level === 'minimal' ? 1 : level === 'comprehensive' ? 8 : 4;
  return {
    architecture: (model.architecture || []).slice(0, level === 'minimal' ? 2 : 4),
    runtimes: (model.runtimes || []).slice(0, level === 'comprehensive' ? 6 : 3),
    contracts: (model.contracts || []).slice(0, contractsLimit),
    importantFiles: (model.importantFiles || []).slice(0, importantFileLimit),
    uncertainties: (model.uncertainties || []).slice(0, level === 'minimal' ? 1 : 4),
    capabilities: (model.importantFiles || [])
      .filter((entry) => /capability|service|feature/i.test(entry.file))
      .slice(0, 5)
      .map((entry) => entry.file.replace(/\.[^.]+$/, '').replace(/^.*\//, ''))
  };
}

module.exports = {
  selectContext
};
