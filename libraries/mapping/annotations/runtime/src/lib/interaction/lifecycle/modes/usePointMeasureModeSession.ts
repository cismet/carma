import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { Cartesian3 } from "@carma/cesium";

import {
  ANNOTATION_TYPE_POINT,
  isPointMeasurementEntry,
  type AnnotationCollection,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { useModeSession } from "./useModeSession";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";

export const usePointMeasureModeSession = (
  annotations: AnnotationCollection,
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>,
  clearAnnotationsByIds: (ids: string[]) => void,
  requestStartPointMeasureMode: () => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const temporaryPointMeasureIds = useMemo(
    () =>
      annotations
        .filter(
          (annotation) =>
            isPointMeasurementEntry(annotation) &&
            !annotation.auxiliaryLabelAnchor &&
            Boolean(annotation.temporary)
        )
        .map((annotation) => annotation.id),
    [annotations]
  );

  const hasTemporaryPointMeasurements =
    temporaryPointMeasureIds.length >= MINIMUM_CLOSE_POINTS_BY_MODE.point;

  const requestFinish = useCallback(() => {
    if (!hasTemporaryPointMeasurements) {
      return false;
    }

    setAnnotations((previousAnnotations) =>
      previousAnnotations.map((annotation) =>
        isPointMeasurementEntry(annotation) && annotation.temporary
          ? { ...annotation, temporary: false }
          : annotation
      )
    );
    return true;
  }, [hasTemporaryPointMeasurements, setAnnotations]);

  const discardDraft = useCallback(() => {
    if (!hasTemporaryPointMeasurements) {
      return;
    }

    clearAnnotationsByIds(temporaryPointMeasureIds);
  }, [
    clearAnnotationsByIds,
    hasTemporaryPointMeasurements,
    temporaryPointMeasureIds,
  ]);

  const requestStart = useCallback(() => {
    requestStartPointMeasureMode();
  }, [requestStartPointMeasureMode]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_POINT,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
  });
};
