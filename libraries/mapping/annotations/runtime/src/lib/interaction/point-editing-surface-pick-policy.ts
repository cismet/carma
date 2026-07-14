import {
  ANNOTATION_TYPES,
  type AnnotationType,
} from "@carma-mapping/annotations/core";

import type { StoredAnnotation } from "../store";

const OWN_GEOMETRY_SURFACE_PICK_EXCLUSION_TYPES = new Set<AnnotationType>([
  ANNOTATION_TYPES.POINT,
  ANNOTATION_TYPES.DISTANCE,
]);

export const shouldExcludeOwnGeometryFromPointEditSurfacePick = ({
  activeEditedNodeId,
  annotationEntries,
  selectedAnnotationIds,
}: {
  activeEditedNodeId: string | null;
  annotationEntries: readonly StoredAnnotation[];
  selectedAnnotationIds: readonly string[];
}): boolean => {
  if (!activeEditedNodeId) {
    return false;
  }

  const selectedAnnotationIdSet = new Set(selectedAnnotationIds);
  return annotationEntries.some(
    (annotation) =>
      selectedAnnotationIdSet.has(annotation.id) &&
      annotation.nodeIds.includes(activeEditedNodeId) &&
      OWN_GEOMETRY_SURFACE_PICK_EXCLUSION_TYPES.has(annotation.toolType)
  );
};
