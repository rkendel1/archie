function buildUncertainties(model = {}) {
  return (model.uncertainties || []).slice(0, 4).map((area) => ({
    area,
    confidence: 0.58
  }));
}

module.exports = {
  buildUncertainties
};
