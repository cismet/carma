import type {
  StoredAnnotation,
  AnnotationNodeLink,
  AnnotationNodeId,
  AnnotationNode,
} from "./annotations-store.types";
import { resolveNodeEditingDisabledNodeIds } from "./annotation-entry.helpers";

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
  selectedAnnotationIds = [],
  preferredMovedNodeIds,
}: {
  nodeId: string;
  nodes: readonly AnnotationNode[];
  linkedNodeGroups: readonly AnnotationNodeLink[];
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds?: readonly string[];
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
  const selectedAnnotationIdSet = new Set(
    selectedAnnotationIds.filter(Boolean)
  );
  const selectedNodeIdSet = new Set(
    annotationEntries
      .filter((annotationEntry) =>
        selectedAnnotationIdSet.has(annotationEntry.id)
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
  const nodeEditingDisabledNodeIds =
    resolveNodeEditingDisabledNodeIds(annotationEntries);

  return {
    targetNode,
    targetLinkedNodeGroup: targetNodeLink,
    movedNodeIds: scopedMovedNodeIds.filter(
      (scopedMovedNodeId) => !nodeEditingDisabledNodeIds.has(scopedMovedNodeId)
    ),
  };
};
