import type {
  StoredAnnotation,
  AnnotationNodeLink,
  AnnotationNodeId,
  AnnotationNode,
} from "./annotations-store.types";

export type AnnotationNodeMoveScope = {
  targetNode: AnnotationNode | null;
  targetLinkedNodeGroup: AnnotationNodeLink | null;
  movedNodeIds: readonly string[];
};

export const resolveAnnotationNodeMoveScope = ({
  nodeId,
  nodes,
  linkedNodeGroups,
  annotationEntries,
  selectedMeasurementIds = [],
  preferredMovedNodeIds,
}: {
  nodeId: string;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  selectedMeasurementIds?: readonly string[];
  preferredMovedNodeIds?: readonly AnnotationNodeId[];
}): AnnotationNodeMoveScope => {
  const targetNode = nodes.find((node) => node.id === nodeId) ?? null;
  if (!targetNode) {
    return {
      targetNode: null,
      targetLinkedNodeGroup: null,
      movedNodeIds: [],
    };
  }

  const targetNodeLink =
    linkedNodeGroups.find((nodeLink) => nodeLink.nodeIds.includes(nodeId)) ??
    null;
  const nodeLinkNodeIds = targetNodeLink?.nodeIds ?? [nodeId];
  const preferredScopedMovedNodeIds = Array.from(
    new Set(
      (preferredMovedNodeIds ?? []).filter((preferredMovedNodeId) =>
        nodeLinkNodeIds.includes(preferredMovedNodeId)
      )
    )
  );
  const selectedMeasurementIdSet = new Set(
    selectedMeasurementIds.filter(Boolean)
  );
  const selectedNodeIdSet = new Set(
    annotationEntries
      .filter((annotationEntry) =>
        selectedMeasurementIdSet.has(annotationEntry.id)
      )
      .flatMap((annotationEntry) => annotationEntry.nodeIds)
  );
  const selectedLinkedNodeIds = nodeLinkNodeIds.filter((linkedNodeId) =>
    selectedNodeIdSet.has(linkedNodeId)
  );
  const scopedMovedNodeIds =
    preferredScopedMovedNodeIds.length > 0
      ? preferredScopedMovedNodeIds
      : selectedLinkedNodeIds.length > 0
      ? selectedLinkedNodeIds
      : [...nodeLinkNodeIds];
  const lockedNodeIdSet = new Set(
    annotationEntries
      .filter((annotationEntry) => annotationEntry.locked)
      .flatMap((annotationEntry) => annotationEntry.nodeIds)
  );

  return {
    targetNode,
    targetLinkedNodeGroup: targetNodeLink,
    movedNodeIds: scopedMovedNodeIds.filter(
      (movedNodeId) => !lockedNodeIdSet.has(movedNodeId)
    ),
  };
};
