import { useCallback } from "react";

import { useStoreSelector } from "@carma-commons/react-store";

import type { AnnotationsStore } from "../../store";

const areStringListsEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
};

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

export const useAnnotationDraftRollbackState = (
  annotationsStore: AnnotationsStore
) => {
  const createdPointIds = useStoreSelector(
    annotationsStore,
    (state) => state.createdPointIds
  );
  const createdRelationIds = useStoreSelector(
    annotationsStore,
    (state) => state.createdRelationIds
  );

  const clearMeasurementDraftSession = useCallback(() => {
    annotationsStore.setState((previousState) =>
      previousState.createdPointIds.length === 0 &&
      previousState.createdRelationIds.length === 0
        ? previousState
        : {
            ...previousState,
            createdPointIds: [],
            createdRelationIds: [],
          }
    );
  }, [annotationsStore]);

  const trackMeasurementDraftPointIds = useCallback(
    (pointIds: readonly string[]) => {
      const normalizedPointIds = pointIds.filter(Boolean);
      if (normalizedPointIds.length === 0) {
        return;
      }

      annotationsStore.setState((previousState) => {
        const nextPointIds = mergeUniqueIds(
          previousState.createdPointIds,
          normalizedPointIds
        );
        return nextPointIds === previousState.createdPointIds
          ? previousState
          : {
              ...previousState,
              createdPointIds: nextPointIds,
            };
      });
    },
    [annotationsStore]
  );

  const trackMeasurementDraftRelationId = useCallback(
    (relationId: string | null) => {
      if (!relationId) {
        return;
      }

      annotationsStore.setState((previousState) => {
        const nextRelationIds = mergeUniqueIds(
          previousState.createdRelationIds,
          [relationId]
        );
        return nextRelationIds === previousState.createdRelationIds
          ? previousState
          : {
              ...previousState,
              createdRelationIds: nextRelationIds,
            };
      });
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

      annotationsStore.setState((previousState) => {
        const nextPointIds = previousState.createdPointIds.filter(
          (pointId) => !removedPointIds.has(pointId)
        );
        const nextRelationIds = previousState.createdRelationIds.filter(
          (relationId) => !removedRelationIds?.has(relationId)
        );

        return areStringListsEqual(
          previousState.createdPointIds,
          nextPointIds
        ) &&
          areStringListsEqual(previousState.createdRelationIds, nextRelationIds)
          ? previousState
          : {
              ...previousState,
              createdPointIds: nextPointIds,
              createdRelationIds: nextRelationIds,
            };
      });
    },
    [annotationsStore]
  );

  return {
    createdPointIds,
    createdRelationIds,
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    trackMeasurementDraftRelationId,
    pruneMeasurementDraftSession,
  };
};

export type MeasurementDraftRollbackState = ReturnType<
  typeof useAnnotationDraftRollbackState
>;
