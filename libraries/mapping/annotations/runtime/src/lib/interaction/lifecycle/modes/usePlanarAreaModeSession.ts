import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_PLANAR,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";
import { useModeSession } from "./useModeSession";
import { MINIMUM_CLOSE_POINTS_BY_MODE } from "./modeCloseRequirements";

export const usePlanarAreaModeSession = (
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartPlanarAreaMode: () => void,
  finishActivePolygonMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenPlanarArea = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed &&
              measurement.type === ANNOTATION_TYPE_AREA_PLANAR
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );

  const requestStart = useCallback(() => {
    requestStartPlanarAreaMode();
  }, [requestStartPlanarAreaMode]);

  const requestFinish = useCallback(() => {
    if (!activeOpenPlanarArea) {
      return false;
    }

    if (
      activeOpenPlanarArea.nodeIds.length >= MINIMUM_CLOSE_POINTS_BY_MODE.area
    ) {
      finishActivePolygonMeasurement();
      return true;
    }

    discardNodeChainMeasurementDraft(activeOpenPlanarArea.id);
    return false;
  }, [
    activeOpenPlanarArea,
    finishActivePolygonMeasurement,
    discardNodeChainMeasurementDraft,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenPlanarArea) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenPlanarArea.id);
  }, [activeOpenPlanarArea, discardNodeChainMeasurementDraft]);

  return useModeSession({
    toolType: ANNOTATION_TYPE_AREA_PLANAR,
    start: requestStart,
    finish: requestFinish,
    discard: discardDraft,
    nodeCreated: onNodeCreated,
    finishesOnLoopClosure: true,
  });
};
