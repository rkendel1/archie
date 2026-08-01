function explainContextRelevance(participant = {}, change = {}) {
  const reasons = [];
  const files = participant.files || [];
  const contracts = participant.contracts || [];

  for (const file of files) {
    if ((change.files || []).includes(file)) reasons.push(`Your work claim includes changed file ${file}.`);
  }

  for (const contract of contracts) {
    if ((change.contracts || []).includes(contract)) reasons.push(`Your scope includes changed contract ${contract}.`);
  }

  if (!reasons.length) reasons.push('You are an active participant for this change.');
  return reasons;
}

module.exports = {
  explainContextRelevance
};
