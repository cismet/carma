import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import type { AnnotationsStore } from "../../store";

type UseAnnotationModeTransitionParams = {
  annotationsStore: AnnotationsStore;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  clearAnnotationCursor: () => void;
  clearAnnotationSelection: () => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  clearPendingPolylineRingPromotion: () => void;
  clearPendingLabelPlacementAnnotation: () => void;
};

export const useAnnotationModeTransition = ({
  annotationsStore,
  setSelectionModeActive,
  clearAnnotationCursor,
  clearAnnotationSelection,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
  clearPendingPolylineRingPromotion,
  clearPendingLabelPlacementAnnotation,
}: UseAnnotationModeTransitionParams) => {
  const requestEnterToolType = useCallback(
    (toolType: AnnotationToolType) => {
      const nextSelectionModeActive = toolType === SELECT_TOOL_TYPE;

      setSelectionModeActive((previousValue) =>
        previousValue === nextSelectionModeActive
          ? previousValue
          : nextSelectionModeActive
      );
      annotationsStore.setState((previousStoreState) =>
        previousStoreState.annotationToolType === toolType
          ? previousStoreState
          : {
              ...previousStoreState,
              annotationToolType: toolType,
            }
      );
    },
    [annotationsStore, setSelectionModeActive]
  );

  const clearSharedModeExitState = useCallback(() => {
    clearAnnotationCursor();
    clearAnnotationSelection();
    clearActiveNodeChainDrawingState();
    clearMoveGizmo();
    clearPendingPolylineRingPromotion();
    clearPendingLabelPlacementAnnotation();
  }, [
    clearActiveNodeChainDrawingState,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearMoveGizmo,
    clearPendingLabelPlacementAnnotation,
    clearPendingPolylineRingPromotion,
  ]);

  return {
    requestEnterToolType,
    clearSharedModeExitState,
  };
};
