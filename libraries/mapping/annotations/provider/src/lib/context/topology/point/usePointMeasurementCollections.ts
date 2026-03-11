import { useMemo } from "react";

import {
  isPointMeasurementEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

import { usePointAnnotationIndex } from "../../render/usePointAnnotationIndex";

export const usePointMeasurementCollections = (
  annotations: AnnotationCollection
) => {
  const { points: pointEntries, pointIds: selectablePointIds } =
    usePointAnnotationIndex(annotations);
  const pointMeasureEntries = useMemo(
    () => annotations.filter(isPointMeasurementEntry),
    [annotations]
  );

  return {
    pointEntries,
    pointMeasureEntries,
    selectablePointIds,
  };
};

export type PointMeasurementCollections = ReturnType<
  typeof usePointMeasurementCollections
>;
