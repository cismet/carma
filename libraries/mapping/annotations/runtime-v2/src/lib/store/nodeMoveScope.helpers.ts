import type {
  RuntimeAnnotationEntry,
  RuntimeLinkedNodeGroup,
  RuntimeNode,
} from "./annotationsStore.types";

export type RuntimeNodeMoveScope = {
  targetNode: RuntimeNode | null;
  targetLinkedNodeGroup: RuntimeLinkedNodeGroup | null;
  movedNodeIds: readonly string[];
};

export const resolveRuntimeNodeMoveScope = ({
  nodeId,
  nodes,
  linkedNodeGroups,
  annotationEntries,
  selectedMeasurementIds = [],
}: {
  nodeId: string;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
  annotationEntries: readonly RuntimeAnnotationEntry[];
  selectedMeasurementIds?: readonly string[];
}): RuntimeNodeMoveScope => {
  const targetNode = nodes.find((node) => node.id === nodeId) ?? null;
  if (!targetNode) {
    return {
      targetNode: null,
      targetLinkedNodeGroup: null,
      movedNodeIds: [],
    };
  }

  const targetLinkedNodeGroup =
    linkedNodeGroups.find((linkedNodeGroup) =>
      linkedNodeGroup.nodeIds.includes(nodeId)
    ) ?? null;
  const linkedNodeGroupNodeIds = targetLinkedNodeGroup?.nodeIds ?? [nodeId];
  const selectedMeasurementIdSet = new Set(selectedMeasurementIds.filter(Boolean));
  const selectedNodeIdSet = new Set(
    annotationEntries
      .filter((annotationEntry) =>
        selectedMeasurementIdSet.has(annotationEntry.id)
      )
      .flatMap((annotationEntry) => annotationEntry.nodeIds)
  );
  const selectedLinkedNodeIds = linkedNodeGroupNodeIds.filter((linkedNodeId) =>
    selectedNodeIdSet.has(linkedNodeId)
  );
  const scopedMovedNodeIds =
    selectedLinkedNodeIds.length > 0
      ? selectedLinkedNodeIds
      : [...linkedNodeGroupNodeIds];
  const lockedNodeIdSet = new Set(
    annotationEntries
      .filter((annotationEntry) => annotationEntry.locked)
      .flatMap((annotationEntry) => annotationEntry.nodeIds)
  );

  return {
    targetNode,
    targetLinkedNodeGroup,
    movedNodeIds: scopedMovedNodeIds.filter(
      (movedNodeId) => !lockedNodeIdSet.has(movedNodeId)
    ),
  };
};
