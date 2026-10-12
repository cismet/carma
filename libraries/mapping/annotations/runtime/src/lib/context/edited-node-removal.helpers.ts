import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";

import type { StoredAnnotation } from "../store";

const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POLYLINE: ANNOTATION_TYPE_POLYLINE,
  AREA_GROUND: ANNOTATION_TYPE_AREA_GROUND,
  AREA_PLANAR: ANNOTATION_TYPE_AREA_PLANAR,
  AREA_VERTICAL: ANNOTATION_TYPE_AREA_VERTICAL,
} = ANNOTATION_TYPES;

/** Fewest nodes a measurement keeps; null for tools without node editing. */
const resolveMinimumNodeCountForAnnotation = (
  annotation: StoredAnnotation
): number | null => {
  switch (annotation.toolType) {
    case ANNOTATION_TYPE_DISTANCE:
    case ANNOTATION_TYPE_POLYLINE:
      return 2;
    case ANNOTATION_TYPE_AREA_GROUND:
    case ANNOTATION_TYPE_AREA_PLANAR:
    case ANNOTATION_TYPE_AREA_VERTICAL:
      return 3;
    default:
      return null;
  }
};

/**
 * The measurement a node removal applies to: among the editable ones holding
 * the node, the most recently selected, else the first.
 */
export const resolveEditedNodeRemovalTarget = ({
  annotationEntries,
  selectedAnnotationIds,
  editedNodeId,
}: {
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
  editedNodeId: string;
}): { annotation: StoredAnnotation; minimumNodeCount: number } | null => {
  const candidates = annotationEntries.filter(
    (annotation) =>
      !annotation.locked &&
      !annotation.readOnly &&
      annotation.nodeIds.includes(editedNodeId) &&
      resolveMinimumNodeCountForAnnotation(annotation) !== null
  );

  let annotation = candidates[0];
  for (let index = selectedAnnotationIds.length - 1; index >= 0; index -= 1) {
    const selected = candidates.find(
      ({ id }) => id === selectedAnnotationIds[index]
    );
    if (selected) {
      annotation = selected;
      break;
    }
  }

  const minimumNodeCount = annotation
    ? resolveMinimumNodeCountForAnnotation(annotation)
    : null;
  return annotation && minimumNodeCount !== null
    ? { annotation, minimumNodeCount }
    : null;
};

/** The chain a degraded measurement leaves as a draft; a ring is cut open at the removed node. */
export const resolveDraftNodeIdsAfterEditedNodeRemoval = ({
  nodeIds,
  editedNodeId,
  closed,
}: {
  nodeIds: readonly string[];
  editedNodeId: string;
  closed: boolean;
}): string[] => {
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
