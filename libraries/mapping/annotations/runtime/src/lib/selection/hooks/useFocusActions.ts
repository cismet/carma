import { useCallback } from "react";
import type { NodeChainAnnotation } from "@carma-mapping/annotations/core";

type UseAnnotationFocusActionsParams = {
  nodeChainAnnotations: NodeChainAnnotation[];
  getRepresentativePointIdForGroupId: (groupId: string) => string | null;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  clearAnnotationSelection: () => void;
  selectAnnotationById: (id: string | null) => void;
};

export const useFocusActions = ({
  nodeChainAnnotations,
  getRepresentativePointIdForGroupId,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  clearAnnotationSelection,
  selectAnnotationById,
}: UseAnnotationFocusActionsParams) => {
  const selectRepresentativeNodeForMeasurementId = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearAnnotationSelection();
        return;
      }

      const representativePointId = getRepresentativePointIdForGroupId(id);
      if (!representativePointId) {
        return;
      }

      clearActiveNodeChainDrawingState();
      clearMoveGizmo();
      selectAnnotationById(representativePointId);
    },
    [
      clearActiveNodeChainDrawingState,
      clearAnnotationSelection,
      clearMoveGizmo,
      getRepresentativePointIdForGroupId,
      selectAnnotationById,
    ]
  );

  const focusAnnotationById = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearAnnotationSelection();
        return;
      }

      const isNodeChainAnnotationId = nodeChainAnnotations.some(
        (annotation) => annotation.id === id
      );
      if (isNodeChainAnnotationId) {
        selectRepresentativeNodeForMeasurementId(id);
        return;
      }

      selectAnnotationById(id);
    },
    [
      clearAnnotationSelection,
      nodeChainAnnotations,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  return {
    selectRepresentativeNodeForMeasurementId,
    focusAnnotationById,
  };
};
