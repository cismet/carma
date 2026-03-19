import { useMemo } from "react";

export const useFocusedNodeChainAnnotationId = (
  selectedAnnotationId: string | null,
  selectedAnnotationIds: string[],
  getOwnerGroupIdsForPointId: (pointId: string) => readonly string[],
  activeNodeChainAnnotationId: string | null
) => {
  const focusedSelectedNodeChainAnnotationId = useMemo(() => {
    if (selectedAnnotationId) {
      return getOwnerGroupIdsForPointId(selectedAnnotationId)[0] ?? null;
    }

    for (const selectedId of selectedAnnotationIds) {
      const ownerGroupId = getOwnerGroupIdsForPointId(selectedId)[0] ?? null;
      if (ownerGroupId) {
        return ownerGroupId;
      }
    }

    return null;
  }, [getOwnerGroupIdsForPointId, selectedAnnotationId, selectedAnnotationIds]);

  return focusedSelectedNodeChainAnnotationId ?? activeNodeChainAnnotationId;
};
