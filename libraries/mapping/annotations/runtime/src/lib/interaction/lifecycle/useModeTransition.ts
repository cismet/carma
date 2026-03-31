import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  SELECT_TOOL_TYPE,
  type AnnotationToolType,
} from "@carma-mapping/annotations/core";

import {
  replaceAnnotationsStoreState,
  type AnnotationsStore,
} from "../../store";
type UseAnnotationModeTransitionParams = {
  annotationsStore: AnnotationsStore;
  setSelectionModeActive: Dispatch<SetStateAction<boolean>>;
  clearAnnotationCursor: () => void;
  clearAnnotationSelection: () => void;
  clearActiveNodeChainDrawingState: () => void;
  clearMoveGizmo: () => void;
  clearPendingLabelPlacementAnnotation: () => void;
};

export const useModeTransition = ({
  annotationsStore,
  setSelectionModeActive,
  clearAnnotationCursor,
  clearAnnotationSelection,
  clearActiveNodeChainDrawingState,
  clearMoveGizmo,
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
      const previousStoreState = annotationsStore.getState();
      if (previousStoreState.annotationToolType === toolType) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousStoreState,
          annotationToolType: toolType,
        })
      );
    },
    [annotationsStore, setSelectionModeActive]
  );

  const clearSharedModeExitState = useCallback(() => {
    clearAnnotationCursor();
    clearAnnotationSelection();
    clearActiveNodeChainDrawingState();
    clearMoveGizmo();
    clearPendingLabelPlacementAnnotation();
  }, [
    clearActiveNodeChainDrawingState,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearMoveGizmo,
    clearPendingLabelPlacementAnnotation,
  ]);

  return {
    requestEnterToolType,
    clearSharedModeExitState,
  };
};
