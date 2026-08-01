const { explainContextRelevance } = require('./relevance');

function buildContextUpdates({ snapshots = [], activeChangeSession = {} }) {
  const changeInfo = {
    files: activeChangeSession.files || [],
    contracts: activeChangeSession.change_proposal?.scope?.contracts || []
  };

  return snapshots
    .filter((snapshot) => snapshot.status === 'refresh-required')
    .map((snapshot) => ({
      participantId: snapshot.participantId,
      changeId: snapshot.changeId,
      status: snapshot.status,
      invalidated: snapshot.invalidated,
      requiredBefore: snapshot.requiredBefore,
      relevance: explainContextRelevance({ id: snapshot.participantId, files: changeInfo.files, contracts: changeInfo.contracts }, changeInfo)
    }));
}

module.exports = {
  buildContextUpdates
};
