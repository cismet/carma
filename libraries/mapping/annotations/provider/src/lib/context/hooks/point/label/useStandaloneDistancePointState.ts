import { useMemo } from "react";

import { buildStandaloneDistancePointSets } from "@carma-mapping/annotations/core";
import type {
  PointAnnotationEntry,
  PointDistanceRelation,
} from "@carma-mapping/annotations/core";

export const useStandaloneDistancePointState = (
  pointEntries: readonly PointAnnotationEntry[],
  distanceRelations: readonly PointDistanceRelation[],
  selectedAnnotationId: string | null,
  selectedAnnotationIds: readonly string[]
) =>
  useMemo(() => {
    const selectedPointIdSet = new Set<string>(selectedAnnotationIds);
    if (selectedAnnotationId) {
      selectedPointIdSet.add(selectedAnnotationId);
    }

    const {
      highestPointIds,
      unfocusedNonHighestPointIds,
      focusedNonHighestPointIds,
    } = buildStandaloneDistancePointSets({
      pointMeasurements: pointEntries,
      distanceRelations,
      selectedPointIds: selectedPointIdSet,
    });

    return {
      standaloneDistanceHighestPointIds: highestPointIds,
      unfocusedStandaloneDistanceNonHighestPointIds:
        unfocusedNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds: focusedNonHighestPointIds,
    } as const;
  }, [
    distanceRelations,
    pointEntries,
    selectedAnnotationId,
    selectedAnnotationIds,
  ]);

export type StandaloneDistancePointState = ReturnType<
  typeof useStandaloneDistancePointState
>;
