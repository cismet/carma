type AnnotationSceneLineEndpoints = {
  startNodeId?: string;
  endNodeId?: string;
};

export const isAnnotationSceneLineDragSampleOccluder = (
  line: AnnotationSceneLineEndpoints,
  activeEditedNodeId: string | null,
  hasLiveAnchor: (nodeId: string) => boolean
): boolean => {
  const endpointNodeIds = [line.startNodeId, line.endNodeId].filter(
    (nodeId): nodeId is string => nodeId !== undefined
  );

  return endpointNodeIds.some(
    (nodeId) => nodeId === activeEditedNodeId || hasLiveAnchor(nodeId)
  );
};
