const { extractSharedResources } = require('./shared-resources');
const { detectDependencies } = require('./dependencies');
const { detectChangeConflicts } = require('./conflicts');
const { recommendOrdering } = require('./ordering');

function buildChangeDependencyGraph(changes = []) {
  const nodes = changes.map((change) => ({
    id: change.id,
    status: change.status,
    updatedAt: change.updated_at
  }));
  const sharedResources = changes.map((change) => extractSharedResources(change));
  const dependencies = detectDependencies(sharedResources);
  const conflicts = detectChangeConflicts(sharedResources);
  return {
    changes: nodes,
    dependencies,
    sharedResources,
    conflicts,
    ordering: recommendOrdering({ dependencies, conflicts })
  };
}

module.exports = {
  buildChangeDependencyGraph
};
