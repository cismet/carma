import { useCallback, type Dispatch, type SetStateAction } from "react";

import {
  replaceAnnotationsStoreState,
  useStoreSelector,
  type AnnotationsStore,
} from "../../store";
import {
  areStringListsEqual,
  resolveSetStateAction,
} from "../../store/stateUpdateUtils";

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
      const previousState = annotationsStore.getState();
      const nextActiveNodeChainAnnotationId = resolveSetStateAction(
        nextValueOrUpdater,
        previousState.activeNodeChainAnnotationId
      );

      if (
        nextActiveNodeChainAnnotationId ===
        previousState.activeNodeChainAnnotationId
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousState,
          activeNodeChainAnnotationId: nextActiveNodeChainAnnotationId,
        })
      );
    },
    [annotationsStore]
  );

  const setLabelInputPromptPointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      const previousState = annotationsStore.getState();
      const nextPendingLabelPlacementAnnotationId = resolveSetStateAction(
        nextValueOrUpdater,
        previousState.pendingLabelPlacementAnnotationId
      );

      if (
        nextPendingLabelPlacementAnnotationId ===
        previousState.pendingLabelPlacementAnnotationId
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousState,
          pendingLabelPlacementAnnotationId:
            nextPendingLabelPlacementAnnotationId,
        })
      );
    },
    [annotationsStore]
  );

  const clearDistanceSession = useCallback(() => {
    const previousState = annotationsStore.getState();
    const { sourcePointId, createdPointIds, createdRelationIds } =
      previousState.distanceSession;
    if (
      sourcePointId === null &&
      createdPointIds.length === 0 &&
      createdRelationIds.length === 0
    ) {
      return;
    }

    annotationsStore.dispatch(
      replaceAnnotationsStoreState({
        ...previousState,
        distanceSession: {
          sourcePointId: null,
          createdPointIds: [],
          createdRelationIds: [],
        },
      })
    );
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

      const previousState = annotationsStore.getState();
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

      if (
        nextSourcePointId === previousSession.sourcePointId &&
        areStringListsEqual(previousSession.createdPointIds, nextPointIds) &&
        areStringListsEqual(previousSession.createdRelationIds, nextRelationIds)
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousState,
          distanceSession: {
            sourcePointId: nextSourcePointId,
            createdPointIds: nextPointIds,
            createdRelationIds: nextRelationIds,
          },
        })
      );
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
