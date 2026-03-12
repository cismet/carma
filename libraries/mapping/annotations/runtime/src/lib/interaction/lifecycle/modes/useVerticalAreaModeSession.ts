import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { useModeSession } from "./useModeSession";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";

export const useVerticalAreaModeSession = (
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartVerticalAreaMode: () => void,
  finishActivePolygonMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenVerticalArea = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed &&
              measurement.type === ANNOTATION_TYPE_AREA_VERTICAL
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );

  const requestStart = useCallback(() => {
    requestStartVerticalAreaMode();
  }, [requestStartVerticalAreaMode]);

  const requestFinish = useCallback(() => {
    if (!activeOpenVerticalArea) {
      return false;
    }

    if (
      activeOpenVerticalArea.nodeIds.length >= MINIMUM_CLOSE_POINTS_BY_MODE.area
    ) {
      finishActivePolygonMeasurement();
      return true;
    }

    discardNodeChainMeasurementDraft(activeOpenVerticalArea.id);
    return false;
  }, [
    activeOpenVerticalArea,
    finishActivePolygonMeasurement,
    discardNodeChainMeasurementDraft,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenVerticalArea) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenVerticalArea.id);
  }, [activeOpenVerticalArea, discardNodeChainMeasurementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_AREA_VERTICAL,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
    finishesOnLoopClosure: true,
  });
};
