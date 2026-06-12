import type {
  AnnotationsStoreState,
  StoredAnnotation,
} from "./annotations-store.types";

export const selectSelectedAnnotationId = (state: {
  selectionState: { selectedAnnotationIds: readonly string[] };
}) =>
  state.selectionState.selectedAnnotationIds[
    state.selectionState.selectedAnnotationIds.length - 1
  ] ?? null;

export const resolveRemovableSelectedAnnotationIds = (state: {
  selectionState: { selectedAnnotationIds: readonly string[] };
  annotationEntries: readonly StoredAnnotation[];
}) => {
  const selectedAnnotationIdSet = new Set(
    state.selectionState.selectedAnnotationIds
  );

  return state.annotationEntries
    .filter(
      (annotationEntry) =>
        selectedAnnotationIdSet.has(annotationEntry.id) &&
        !annotationEntry.locked &&
        !annotationEntry.readOnly
    )
    .map((annotationEntry) => annotationEntry.id);
};

export const selectAllAnnotationIds = (
  state: Pick<AnnotationsStoreState, "annotationEntries">
) => state.annotationEntries.map((annotationEntry) => annotationEntry.id);

export const selectAdjacentAnnotationEntryId = (
  annotationEntries: readonly StoredAnnotation[],
  selectedAnnotationId: string | null,
  offset: -1 | 1
): string | null => {
  if (annotationEntries.length === 0) {
    return null;
  }

  const currentIndex = selectedAnnotationId
    ? annotationEntries.findIndex((entry) => entry.id === selectedAnnotationId)
    : -1;
  const fallbackIndex = offset > 0 ? 0 : annotationEntries.length - 1;
  const nextIndex =
    currentIndex < 0
      ? fallbackIndex
      : (currentIndex + offset + annotationEntries.length) %
        annotationEntries.length;

  return annotationEntries[nextIndex]?.id ?? null;
};
