const resolvePickedIdCandidates = (pickedObject: unknown): unknown[] => {
  if (typeof pickedObject !== "object" || pickedObject === null) {
    return [];
  }

  const directId = (pickedObject as { id?: unknown }).id;
  const primitiveId =
    "primitive" in pickedObject &&
    typeof (pickedObject as { primitive?: unknown }).primitive === "object" &&
    (pickedObject as { primitive?: unknown }).primitive !== null
      ? (
          (pickedObject as { primitive: { id?: unknown } }).primitive as {
            id?: unknown;
          }
        ).id
      : undefined;

  return [directId, primitiveId].filter((candidate) => candidate !== undefined);
};

export const resolveSceneSelectionTarget = ({
  pickedObject,
  edgeAnnotationIdsById,
  polygonFillAnnotationIdsById,
}: {
  pickedObject: unknown;
  edgeAnnotationIdsById: ReadonlyMap<string, string | null>;
  polygonFillAnnotationIdsById: ReadonlyMap<string, string | null>;
}) => {
  const pickedIdCandidates = resolvePickedIdCandidates(pickedObject);

  for (const pickedId of pickedIdCandidates) {
    if (typeof pickedId === "string") {
      const matchingEdgeEntry = [...edgeAnnotationIdsById.entries()].find(
        ([edgeId]) => pickedId === edgeId || pickedId.startsWith(`${edgeId}-`)
      );
      if (matchingEdgeEntry) {
        return {
          isRuntimeTarget: true,
          annotationId: matchingEdgeEntry[1],
        };
      }
    }

    if (
      typeof pickedId === "object" &&
      pickedId !== null &&
      "polygonGroupId" in pickedId
    ) {
      const polygonGroupId = (pickedId as { polygonGroupId?: unknown })
        .polygonGroupId;
      if (typeof polygonGroupId === "string") {
        if (polygonFillAnnotationIdsById.has(polygonGroupId)) {
          return {
            isRuntimeTarget: true,
            annotationId:
              polygonFillAnnotationIdsById.get(polygonGroupId) ?? null,
          };
        }
      }
    }
  }

  return {
    isRuntimeTarget: false,
    annotationId: null,
  };
};
