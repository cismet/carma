export const resolveSceneSelectionTarget = ({
  pickedIds,
  edgeAnnotationIdsById,
  polygonFillAnnotationIdsById,
}: {
  pickedIds: readonly string[];
  edgeAnnotationIdsById: ReadonlyMap<string, string | null>;
  polygonFillAnnotationIdsById: ReadonlyMap<string, string | null>;
}) => {
  for (const pickedId of pickedIds) {
    const matchingEdgeEntry = [...edgeAnnotationIdsById.entries()].find(
      ([edgeId]) => pickedId === edgeId || pickedId.startsWith(`${edgeId}-`)
    );
    if (matchingEdgeEntry) {
      return {
        isRuntimeTarget: true,
        annotationId: matchingEdgeEntry[1],
      };
    }

    if (polygonFillAnnotationIdsById.has(pickedId)) {
      return {
        isRuntimeTarget: true,
        annotationId: polygonFillAnnotationIdsById.get(pickedId) ?? null,
      };
    }
  }

  return {
    isRuntimeTarget: false,
    annotationId: null,
  };
};
