import { useCallback } from "react";

import {
  replaceAnnotationsStoreState,
  useStoreSelector,
  type AnnotationsStore,
} from "../../store";
import { areStringListsEqual } from "../../store/stateUpdateUtils";

const mergeUniqueIds = (
  previousIds: readonly string[],
  nextIds: readonly string[]
): readonly string[] => {
  const idsToAdd = nextIds
    .filter(Boolean)
    .filter((id) => !previousIds.includes(id));
  if (idsToAdd.length === 0) {
    return previousIds;
  }

  return [...previousIds, ...idsToAdd];
};

export const useDraftRollbackState = (annotationsStore: AnnotationsStore) => {
  const createdPointIds = useStoreSelector(
    annotationsStore,
    (state) => state.createdPointIds
  );
  const createdRelationIds = useStoreSelector(
    annotationsStore,
    (state) => state.createdRelationIds
  );

  const clearMeasurementDraftSession = useCallback(() => {
    const previousState = annotationsStore.getState();
    if (
      previousState.createdPointIds.length === 0 &&
      previousState.createdRelationIds.length === 0
    ) {
      return;
    }

    annotationsStore.dispatch(
      replaceAnnotationsStoreState({
        ...previousState,
        createdPointIds: [],
        createdRelationIds: [],
      })
    );
  }, [annotationsStore]);

  const trackMeasurementDraftPointIds = useCallback(
    (pointIds: readonly string[]) => {
      const normalizedPointIds = pointIds.filter(Boolean);
      if (normalizedPointIds.length === 0) {
        return;
      }

      const previousState = annotationsStore.getState();
      const nextPointIds = mergeUniqueIds(
        previousState.createdPointIds,
        normalizedPointIds
      );
      if (nextPointIds === previousState.createdPointIds) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousState,
          createdPointIds: nextPointIds,
        })
      );
    },
    [annotationsStore]
  );

  const pruneMeasurementDraftSession = useCallback(
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
      const nextPointIds = previousState.createdPointIds.filter(
        (pointId) => !removedPointIds.has(pointId)
      );
      const nextRelationIds = previousState.createdRelationIds.filter(
        (relationId) => !removedRelationIds?.has(relationId)
      );

      if (
        areStringListsEqual(previousState.createdPointIds, nextPointIds) &&
        areStringListsEqual(previousState.createdRelationIds, nextRelationIds)
      ) {
        return;
      }

      annotationsStore.dispatch(
        replaceAnnotationsStoreState({
          ...previousState,
          createdPointIds: nextPointIds,
          createdRelationIds: nextRelationIds,
        })
      );
    },
    [annotationsStore]
  );

  return {
    createdPointIds,
    createdRelationIds,
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    pruneMeasurementDraftSession,
  };
};

export type MeasurementDraftRollbackState = ReturnType<
  typeof useDraftRollbackState
>;
