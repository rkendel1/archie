const crypto = require('node:crypto');
const { defaultCoordinationOptions } = require('./negotiation');
const { suggestOwnershipResolution } = require('./ownership-resolution');

function buildCoordinationActions({ changeId = null, conflicts = [], existing = [] }) {
  const actions = [];
  const unresolvedExisting = (existing || []).filter((entry) => ['open', 'proposed', 'accepted', 'escalated'].includes(entry.status));
  actions.push(...unresolvedExisting);

  for (const conflict of conflicts) {
    const key = `${changeId}:${(conflict.claims || []).join(':')}`;
    if (actions.some((entry) => entry.conflictKey === key)) continue;
    actions.push({
      id: `coord_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
      changeId,
      conflictId: conflict.id || key,
      conflictKey: key,
      participants: conflict.participants || [],
      options: defaultCoordinationOptions(),
      status: 'open',
      selectedOption: null,
      suggestion: suggestOwnershipResolution(conflict),
      scope: {
        files: conflict.overlap?.files || [],
        capabilities: conflict.overlap?.capabilities || [],
        contracts: conflict.overlap?.contracts || [],
        runtimes: conflict.overlap?.runtimes || []
      },
      createdAt: new Date().toISOString()
    });
  }

  return actions;
}

module.exports = {
  buildCoordinationActions
};
