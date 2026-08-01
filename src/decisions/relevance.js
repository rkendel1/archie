function findRelevantDecisions(decisions = [], context = {}) {
  const files = new Set((context.files || []).map((entry) => String(entry).toLowerCase()));
  const contracts = new Set((context.contracts || []).map((entry) => String(entry).toLowerCase()));
  const runtimes = new Set((context.runtimes || []).map((entry) => String(entry).toLowerCase()));
  return decisions.filter((decision) => {
    const affected = decision.affectedSystem || {};
    return (affected.files || []).some((entry) => files.has(String(entry).toLowerCase()))
      || (affected.contracts || []).some((entry) => contracts.has(String(entry).toLowerCase()))
      || (affected.runtimes || []).some((entry) => runtimes.has(String(entry).toLowerCase()));
  });
}

module.exports = {
  findRelevantDecisions
};
