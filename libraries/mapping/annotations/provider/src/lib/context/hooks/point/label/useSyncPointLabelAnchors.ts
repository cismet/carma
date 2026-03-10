import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
  applyDesiredPointLabelAnchors,
  isPointAnnotationEntry,
  type AnnotationCollection,
  type AnnotationLabelAnchor,
} from "@carma-mapping/annotations/core";

export const useSyncPointLabelAnchors = (
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>,
  desiredLabelAnchorByPointId: Readonly<
    Record<string, AnnotationLabelAnchor | undefined>
  >
) => {
  useEffect(
    function syncPointLabelAnchorsEffect() {
      setAnnotations((previousAnnotations) => {
        const { nextMeasurements, hasChanges } = applyDesiredPointLabelAnchors({
          annotations: previousAnnotations,
          desiredLabelAnchorByPointId,
          isPointMeasurement: isPointAnnotationEntry,
        });

        return hasChanges ? nextMeasurements : previousAnnotations;
      });
    },
    [desiredLabelAnchorByPointId, setAnnotations]
  );
};
