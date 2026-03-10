import { useCallback, useState } from "react";

import type { AnnotationToolType } from "@carma-mapping/annotations/core";

export type MeasurementDraftSession = {
  toolType: AnnotationToolType | null;
  createdPointIds: readonly string[];
  createdRelationIds: readonly string[];
};

const EMPTY_MEASUREMENT_DRAFT_SESSION: MeasurementDraftSession = {
  toolType: null,
  createdPointIds: [],
  createdRelationIds: [],
};

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

export const useMeasurementDraftSessionState = () => {
  const [draftSession, setDraftSession] = useState<MeasurementDraftSession>(
    EMPTY_MEASUREMENT_DRAFT_SESSION
  );

  const clearMeasurementDraftSession = useCallback(() => {
    setDraftSession((previousSession) =>
      previousSession.toolType === null &&
      previousSession.createdPointIds.length === 0 &&
      previousSession.createdRelationIds.length === 0
        ? previousSession
        : EMPTY_MEASUREMENT_DRAFT_SESSION
    );
  }, []);

  const trackMeasurementDraftPointIds = useCallback(
    (toolType: AnnotationToolType, pointIds: readonly string[]) => {
      const normalizedPointIds = pointIds.filter(Boolean);
      if (normalizedPointIds.length === 0) {
        return;
      }

      setDraftSession((previousSession) => {
        const nextPointIds = mergeUniqueIds(
          previousSession.createdPointIds,
          normalizedPointIds
        );
        if (
          previousSession.toolType === toolType &&
          nextPointIds === previousSession.createdPointIds
        ) {
          return previousSession;
        }

        return {
          toolType,
          createdPointIds: nextPointIds,
          createdRelationIds: previousSession.createdRelationIds,
        };
      });
    },
    []
  );

  const trackMeasurementDraftRelationId = useCallback(
    (toolType: AnnotationToolType, relationId: string | null) => {
      if (!relationId) {
        return;
      }

      setDraftSession((previousSession) => {
        const nextRelationIds = mergeUniqueIds(
          previousSession.createdRelationIds,
          [relationId]
        );
        if (
          previousSession.toolType === toolType &&
          nextRelationIds === previousSession.createdRelationIds
        ) {
          return previousSession;
        }

        return {
          toolType,
          createdPointIds: previousSession.createdPointIds,
          createdRelationIds: nextRelationIds,
        };
      });
    },
    []
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

      setDraftSession((previousSession) => {
        const nextPointIds = previousSession.createdPointIds.filter(
          (pointId) => !removedPointIds.has(pointId)
        );
        const nextRelationIds = previousSession.createdRelationIds.filter(
          (relationId) => !removedRelationIds?.has(relationId)
        );

        if (
          areStringListsEqual(previousSession.createdPointIds, nextPointIds) &&
          areStringListsEqual(
            previousSession.createdRelationIds,
            nextRelationIds
          )
        ) {
          return previousSession;
        }

        if (nextPointIds.length === 0 && nextRelationIds.length === 0) {
          return EMPTY_MEASUREMENT_DRAFT_SESSION;
        }

        return {
          toolType: previousSession.toolType,
          createdPointIds: nextPointIds,
          createdRelationIds: nextRelationIds,
        };
      });
    },
    []
  );

  return {
    draftSession,
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    trackMeasurementDraftRelationId,
    pruneMeasurementDraftSession,
  };
};
