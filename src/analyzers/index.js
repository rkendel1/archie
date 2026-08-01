const { javascriptAnalyzer } = require('./javascript');
const { pythonAnalyzer } = require('./python');
const { mergeObservations, languageDistribution } = require('./contracts');

const analyzers = [javascriptAnalyzer, pythonAnalyzer];

function analyzeRepository(rootDir, filesAbs) {
  const observations = analyzers.map((analyzer) => analyzer.analyzeRepository(rootDir, filesAbs));
  const observation = mergeObservations(observations);
  const languages = languageDistribution(observation);
  return {
    analyzers: analyzers.map((analyzer) => ({
      id: analyzer.id,
      version: analyzer.version,
      language: analyzer.languages.join('/'),
      capabilities: analyzer.capabilities,
      status: 'Active',
      incrementalAnalysis: analyzer.supportsIncrementalAnalysis ? 'Supported' : 'Not yet supported'
    })),
    observation,
    languages
  };
}

module.exports = {
  analyzers,
  analyzeRepository
};
