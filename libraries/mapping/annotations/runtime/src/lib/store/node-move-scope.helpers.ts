import type {
  RuntimeAnnotationEntry,
  RuntimeNodeLink,
  RuntimeNodeId,
  RuntimeNode,
} from "./annotations-store.types";

export type RuntimeNodeMoveScope = {
  targetNode: RuntimeNode | null;
  targetLinkedNodeGroup: RuntimeNodeLink | null;
  movedNodeIds: readonly string[];
};

export const resolveRuntimeNodeMoveScope = ({
  nodeId,
  nodes,
  linkedNodeGroups,
  annotationEntries,
  selectedMeasurementIds = [],
  preferredMovedNodeIds,
}: {
  nodeId: string;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeNodeLink[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  selectedMeasurementIds?: readonly string[];
  preferredMovedNodeIds?: readonly RuntimeNodeId[];
}): RuntimeNodeMoveScope => {
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
