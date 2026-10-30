import {
  findAnnotationEntryById,
  type AnnotationsStore,
  type StoredAnnotation,
} from "../store";

export const findAnnotationEntryInStore = (
  annotationsStore: AnnotationsStore,
  annotationId: string | null
): StoredAnnotation | null =>
  findAnnotationEntryById(
    annotationsStore.getState().annotationEntries,
    annotationId
  );

/** Neither locked nor read-only: the entry may be edited or deleted. */
export const isAnnotationEntryEditable = (
  annotationEntry: StoredAnnotation | null
): annotationEntry is StoredAnnotation =>
  annotationEntry !== null &&
  !annotationEntry.locked &&
  !annotationEntry.readOnly;

export const resolveEditableAnnotationEntries = (
  annotationEntries: readonly StoredAnnotation[],
  annotationIds: readonly string[]
): StoredAnnotation[] =>
  annotationIds
    .map((annotationId) =>
      findAnnotationEntryById(annotationEntries, annotationId)
    )
    .filter(isAnnotationEntryEditable);
