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

const areStringListsEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

export const useDraftSessionState = (annotationsStore: AnnotationsStore) => {
  const activeNodeChainAnnotationId = useStoreSelector(
    annotationsStore,
    (state) => state.activeNodeChainAnnotationId
  );
  const labelInputPromptPointId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const distanceSession = useStoreSelector(
    annotationsStore,
    (state) => state.distanceSession
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

  const clearDistanceSession = useCallback(() => {
    annotationsStore.setState((previousState) => {
      const { sourcePointId, createdPointIds, createdRelationIds } =
        previousState.distanceSession;
      if (
        sourcePointId === null &&
        createdPointIds.length === 0 &&
        createdRelationIds.length === 0
      ) {
        return previousState;
      }

      return {
        ...previousState,
        distanceSession: {
          sourcePointId: null,
          createdPointIds: [],
          createdRelationIds: [],
        },
      };
    });
  }, [annotationsStore]);

  const pruneDistanceSession = useCallback(
    (
      removedPointIds: ReadonlySet<string>,
      removedRelationIds?: ReadonlySet<string>
    ) => {
      if (
        removedPointIds.size === 0 &&
        (!removedRelationIds || removedRelationIds.size === 0)
      ) {
        return;
      }

      annotationsStore.setState((previousState) => {
        const previousSession = previousState.distanceSession;
        const nextPointIds = previousSession.createdPointIds.filter(
          (pointId) => !removedPointIds.has(pointId)
        );
        const nextRelationIds = previousSession.createdRelationIds.filter(
          (relationId) => !removedRelationIds?.has(relationId)
        );
        const nextSourcePointId =
          previousSession.sourcePointId &&
          removedPointIds.has(previousSession.sourcePointId)
            ? null
            : previousSession.sourcePointId;

        return nextSourcePointId === previousSession.sourcePointId &&
          areStringListsEqual(previousSession.createdPointIds, nextPointIds) &&
          areStringListsEqual(
            previousSession.createdRelationIds,
            nextRelationIds
          )
          ? previousState
          : {
              ...previousState,
              distanceSession: {
                sourcePointId: nextSourcePointId,
                createdPointIds: nextPointIds,
                createdRelationIds: nextRelationIds,
              },
            };
      });
    },
    [annotationsStore]
  );

  return {
    activeNodeChainAnnotationId,
    labelInputPromptPointId,
    distanceSession,
    setActiveNodeChainAnnotationId,
    setLabelInputPromptPointId,
    clearDistanceSession,
    pruneDistanceSession,
  };
};

export type AnnotationDraftSessionState = ReturnType<
  typeof useDraftSessionState
>;
