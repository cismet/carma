export const isRuntimeSceneSelectionTarget = ({
  pickedObject,
  edgeIds,
  polygonFillIds,
}: {
  pickedObject: unknown;
  edgeIds: ReadonlySet<string>;
  polygonFillIds: ReadonlySet<string>;
}) => {
  const pickedId =
    typeof pickedObject === "object" && pickedObject !== null
      ? (pickedObject as { id?: unknown }).id
      : undefined;

  if (typeof pickedId === "string") {
    return [...edgeIds].some(
      (edgeId) => pickedId === edgeId || pickedId.startsWith(`${edgeId}-`)
    );
  }

  if (
    typeof pickedId === "object" &&
    pickedId !== null &&
    "polygonGroupId" in pickedId
  ) {
    const polygonGroupId = (pickedId as { polygonGroupId?: unknown })
      .polygonGroupId;
    return (
      typeof polygonGroupId === "string" && polygonFillIds.has(polygonGroupId)
    );
  }

  return false;
};
