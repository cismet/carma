import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  applyDesiredPointLabelAnchors,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationLabelAnchor,
} from "@carma-mapping/annotations/core";

export const applyPointLabelAnchors = (
  annotations: AnnotationCollection,
  desiredLabelAnchorByPointId: Readonly<
    Record<string, AnnotationLabelAnchor | undefined>
  >
): AnnotationCollection => {
  const { nextMeasurements, hasChanges } = applyDesiredPointLabelAnchors({
    annotations,
    desiredLabelAnchorByPointId,
    isPointMeasurement: isPointAnnotationEntry,
  });

  return hasChanges ? nextMeasurements : annotations;
};

export const useSyncPointLabelAnchors = (
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>,
  desiredLabelAnchorByPointId: Readonly<
    Record<string, AnnotationLabelAnchor | undefined>
  >
) => {
  useEffect(
    function syncPointLabelAnchorsEffect() {
      setAnnotations((previousAnnotations) => {
        return applyPointLabelAnchors(
          previousAnnotations,
          desiredLabelAnchorByPointId
        );
      });
    },
    [desiredLabelAnchorByPointId, setAnnotations]
  );
};
