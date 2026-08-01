function assessCompatibility(representations = []) {
  if (!representations.length) {
    return {
      state: 'unknown',
      score: 0.4,
      reasons: ['No representations found']
    };
  }
  const languages = new Set(representations.map((item) => item.language).filter(Boolean));
  const hasSnake = representations.some((item) => /_[a-z]/.test(item.file || ''));
  const hasCamel = representations.some((item) => /[a-z][A-Z]/.test(item.file || ''));
  const reasons = [];
  let score = 1;
  if (languages.size >= 3) {
    score -= 0.25;
    reasons.push('Contract spans multiple language ecosystems');
  }
  if (hasSnake && hasCamel) {
    score -= 0.2;
    reasons.push('Potential field naming drift between snake_case and camelCase representations');
  }
  if (representations.length > 4) {
    score -= 0.1;
    reasons.push('High representation count increases compatibility risk');
  }
  const state = score >= 0.8 ? 'compatible' : score >= 0.6 ? 'needs-review' : 'breaking';
  return { state, score: Number(score.toFixed(2)), reasons };
}

module.exports = {
  assessCompatibility
};
