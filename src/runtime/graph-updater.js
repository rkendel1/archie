function edgeKey(edge) {
  return `${edge.from}::${edge.type}::${edge.to}`;
}

function computeGraphDelta(previousGraph = {}, nextGraph = {}) {
  const previousNodes = new Map((previousGraph.nodes || []).map((node) => [node.id, node]));
  const nextNodes = new Map((nextGraph.nodes || []).map((node) => [node.id, node]));
  const previousEdges = new Map((previousGraph.edges || []).map((edge) => [edgeKey(edge), edge]));
  const nextEdges = new Map((nextGraph.edges || []).map((edge) => [edgeKey(edge), edge]));

  let nodesAdded = 0;
  let nodesUpdated = 0;
  let nodesRemoved = 0;

  for (const [id, node] of nextNodes.entries()) {
    if (!previousNodes.has(id)) nodesAdded += 1;
    else if (JSON.stringify(previousNodes.get(id)) !== JSON.stringify(node)) nodesUpdated += 1;
  }
  for (const id of previousNodes.keys()) {
    if (!nextNodes.has(id)) nodesRemoved += 1;
  }

  let edgesAdded = 0;
  let edgesRemoved = 0;
  for (const key of nextEdges.keys()) if (!previousEdges.has(key)) edgesAdded += 1;
  for (const key of previousEdges.keys()) if (!nextEdges.has(key)) edgesRemoved += 1;

  return {
    nodes_added: nodesAdded,
    nodes_updated: nodesUpdated,
    nodes_removed: nodesRemoved,
    edges_added: edgesAdded,
    edges_removed: edgesRemoved
  };
}

module.exports = { computeGraphDelta };
