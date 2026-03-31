import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma/cesium";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";
import { useModeSession } from "./useModeSession";
export const useDistanceMeasureModeSession = (
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartDistanceMode: () => void,
  finishActiveOpenLineMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenDistanceMeasurement = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed &&
              measurement.type === ANNOTATION_TYPE_DISTANCE
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );

  const requestStart = useCallback(() => {
    requestStartDistanceMode();
  }, [requestStartDistanceMode]);

  const requestFinish = useCallback(() => {
    if (!activeOpenDistanceMeasurement) {
      return false;
    }

    if (
      activeOpenDistanceMeasurement.nodeIds.length >=
      MINIMUM_CLOSE_POINTS_BY_MODE.distance
    ) {
      finishActiveOpenLineMeasurement();
      return true;
    }

    discardNodeChainMeasurementDraft(activeOpenDistanceMeasurement.id);
    return false;
  }, [
    activeOpenDistanceMeasurement,
    discardNodeChainMeasurementDraft,
    finishActiveOpenLineMeasurement,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenDistanceMeasurement) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenDistanceMeasurement.id);
  }, [activeOpenDistanceMeasurement, discardNodeChainMeasurementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_DISTANCE,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
  });
};
