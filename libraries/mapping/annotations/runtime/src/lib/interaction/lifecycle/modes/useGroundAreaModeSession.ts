import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { useModeSession } from "./useModeSession";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";

export const useGroundAreaModeSession = (
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartGroundAreaMode: () => void,
  finishActivePolygonMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenGroundArea = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed &&
              measurement.type === ANNOTATION_TYPE_AREA_GROUND
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );

  const requestStart = useCallback(() => {
    requestStartGroundAreaMode();
  }, [requestStartGroundAreaMode]);

  const requestFinish = useCallback(() => {
    if (!activeOpenGroundArea) {
      return false;
    }

    if (
      activeOpenGroundArea.nodeIds.length >= MINIMUM_CLOSE_POINTS_BY_MODE.area
    ) {
      finishActivePolygonMeasurement();
      return true;
    }

    discardNodeChainMeasurementDraft(activeOpenGroundArea.id);
    return false;
  }, [
    activeOpenGroundArea,
    finishActivePolygonMeasurement,
    discardNodeChainMeasurementDraft,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenGroundArea) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenGroundArea.id);
  }, [activeOpenGroundArea, discardNodeChainMeasurementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_AREA_GROUND,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
    finishesOnLoopClosure: true,
  });
};
