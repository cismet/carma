import { useCallback, type Dispatch, type SetStateAction } from "react";

import { useStoreSelector } from "@carma-commons/react-store";

import type { AnnotationsStore } from "../../store";

const resolveSetStateAction = <TValue>(
  action: SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof action === "function"
    ? (action as (previousValue: TValue) => TValue)(previousValue)
    : action;

export const useAnnotationDraftSessionState = (
  annotationsStore: AnnotationsStore
) => {
  const activeNodeChainAnnotationId = useStoreSelector(
    annotationsStore,
    (state) => state.activeNodeChainAnnotationId
  );
  const pendingPolylinePromotionRingClosurePointId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingPolylineRingPromotionPointId
  );
  const labelInputPromptPointId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const doubleClickChainSourcePointId = useStoreSelector(
    annotationsStore,
    (state) => state.openChainPointId
  );

  const setActiveNodeChainAnnotationId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextActiveNodeChainAnnotationId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.activeNodeChainAnnotationId
        );

        return nextActiveNodeChainAnnotationId ===
          previousState.activeNodeChainAnnotationId
          ? previousState
          : {
              ...previousState,
              activeNodeChainAnnotationId: nextActiveNodeChainAnnotationId,
            };
      });
    },
    [annotationsStore]
  );

  const setPendingPolylinePromotionRingClosurePointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextPendingPolylineRingPromotionPointId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.pendingPolylineRingPromotionPointId
        );

        return nextPendingPolylineRingPromotionPointId ===
          previousState.pendingPolylineRingPromotionPointId
          ? previousState
          : {
              ...previousState,
              pendingPolylineRingPromotionPointId:
                nextPendingPolylineRingPromotionPointId,
            };
      });
    },
    [annotationsStore]
  );

  const setLabelInputPromptPointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextPendingLabelPlacementAnnotationId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.pendingLabelPlacementAnnotationId
        );

        return nextPendingLabelPlacementAnnotationId ===
          previousState.pendingLabelPlacementAnnotationId
          ? previousState
          : {
              ...previousState,
              pendingLabelPlacementAnnotationId:
                nextPendingLabelPlacementAnnotationId,
            };
      });
    },
    [annotationsStore]
  );

  const setDoubleClickChainSourcePointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextOpenChainPointId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.openChainPointId
        );

        return nextOpenChainPointId === previousState.openChainPointId
          ? previousState
          : {
              ...previousState,
              openChainPointId: nextOpenChainPointId,
            };
      });
    },
    [annotationsStore]
  );

  return {
    activeNodeChainAnnotationId,
    pendingPolylinePromotionRingClosurePointId,
    labelInputPromptPointId,
    doubleClickChainSourcePointId,
    setActiveNodeChainAnnotationId,
    setPendingPolylinePromotionRingClosurePointId,
    setLabelInputPromptPointId,
    setDoubleClickChainSourcePointId,
  };
};

export type AnnotationDraftSessionState = ReturnType<
  typeof useAnnotationDraftSessionState
>;
