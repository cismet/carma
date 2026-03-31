import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_POLYLINE,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { Cartesian3 } from "@carma/cesium";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";
import { useModeSession } from "./useModeSession";
export const usePolylineModeSession = (
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartPolylineMode: () => void,
  finishActivePolylineMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenPolyline = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed &&
              measurement.type === ANNOTATION_TYPE_POLYLINE
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );

  const requestStart = useCallback(() => {
    requestStartPolylineMode();
  }, [requestStartPolylineMode]);

  const requestFinish = useCallback(() => {
    if (!activeOpenPolyline) {
      return false;
    }

    if (
      activeOpenPolyline.nodeIds.length >= MINIMUM_CLOSE_POINTS_BY_MODE.polyline
    ) {
      finishActivePolylineMeasurement();
      return true;
    }

    discardNodeChainMeasurementDraft(activeOpenPolyline.id);
    return false;
  }, [
    activeOpenPolyline,
    discardNodeChainMeasurementDraft,
    finishActivePolylineMeasurement,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenPolyline) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenPolyline.id);
  }, [activeOpenPolyline, discardNodeChainMeasurementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_POLYLINE,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
    finishesOnLoopClosure: true,
  });
};
