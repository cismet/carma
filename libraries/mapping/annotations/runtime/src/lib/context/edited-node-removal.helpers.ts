export type ResolveDraftNodeIdsAfterEditedNodeRemovalOptions = {
  nodeIds: readonly string[];
  editedNodeId: string;
  closed: boolean;
};

export const resolveDraftNodeIdsAfterEditedNodeRemoval = ({
  nodeIds,
  editedNodeId,
  closed,
}: ResolveDraftNodeIdsAfterEditedNodeRemovalOptions): string[] => {
  const editedNodeIndex = nodeIds.indexOf(editedNodeId);
  if (!closed || editedNodeIndex < 0) {
    return nodeIds.filter((nodeId) => nodeId !== editedNodeId);
  }

  const draftNodeIds: string[] = [];
  for (let offset = 1; offset < nodeIds.length; offset += 1) {
    const nodeId = nodeIds[(editedNodeIndex + offset) % nodeIds.length];
    if (nodeId && nodeId !== editedNodeId) {
      draftNodeIds.push(nodeId);
    }
  }

  return draftNodeIds;
};
