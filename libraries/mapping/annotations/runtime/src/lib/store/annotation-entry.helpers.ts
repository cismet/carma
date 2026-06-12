import {
  ANNOTATION_ENTRY_ROLES,
  type AnnotationNodeId,
  ANNOTATION_ELEVATION_DISPLAY_MODES,
  type StoredAnnotation,
} from "./annotations-store.types";

export const findAnnotationEntryById = (
  annotationEntries: readonly StoredAnnotation[],
  annotationId: string | null
): StoredAnnotation | null =>
  annotationId
    ? annotationEntries.find((entry) => entry.id === annotationId) ?? null
    : null;

export const resolveNodeEditingDisabledNodeIds = (
  annotationEntries: readonly StoredAnnotation[]
): ReadonlySet<AnnotationNodeId> =>
  new Set(
    annotationEntries
      .filter(
        (annotationEntry) =>
          annotationEntry.annotationRole === ANNOTATION_ENTRY_ROLES.EXTERNAL ||
          annotationEntry.readOnly ||
          annotationEntry.locked
      )
      .flatMap((annotationEntry) => annotationEntry.nodeIds)
  );

export const resolveNextElevationDisplayMode = (
  currentMode: StoredAnnotation["elevationDisplayMode"]
) =>
  currentMode === ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE
    ? ANNOTATION_ELEVATION_DISPLAY_MODES.RELATIVE
    : ANNOTATION_ELEVATION_DISPLAY_MODES.ABSOLUTE;
