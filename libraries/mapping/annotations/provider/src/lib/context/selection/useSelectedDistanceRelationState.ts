import { useMemo } from "react";

import {
  isSameDistanceRelationPair,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

type SelectedDistancePair = {
  activePointId: string;
  previousPointId: string;
} | null;

export const useSelectedDistanceRelationState = (
  distanceRelations: PointDistanceRelation[],
  selectedDistancePair: SelectedDistancePair
) => {
  const selectedDistanceRelation = useMemo(() => {
    if (!selectedDistancePair) return null;
    return (
      distanceRelations.find((relation) =>
        isSameDistanceRelationPair(
          relation,
          selectedDistancePair.activePointId,
          selectedDistancePair.previousPointId
        )
      ) ?? null
    );
  }, [distanceRelations, selectedDistancePair]);

  const showSelectedReferenceLine =
    selectedDistanceRelation?.showDirectLine ?? false;
  const selectedVerticalLineVisible =
    selectedDistanceRelation?.showVerticalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const selectedHorizontalLineVisible =
    selectedDistanceRelation?.showHorizontalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const showSelectedReferenceLineComponents =
    selectedVerticalLineVisible || selectedHorizontalLineVisible;

  return {
    selectedDistanceRelation,
    showSelectedReferenceLine,
    showSelectedReferenceLineComponents,
  };
};
