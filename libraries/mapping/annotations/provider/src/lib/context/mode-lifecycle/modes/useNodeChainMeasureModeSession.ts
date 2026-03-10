import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_POLYLINE,
  type PlanarMeasurementGroup,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const useNodeChainMeasureModeSession = (
  toolType: PlanarMeasurementGroup["type"],
  activePlanarMeasurementId: string | null,
  nodeChainMeasurements: readonly PlanarMeasurementGroup[],
  requestStartNodeChainToolMode: () => void,
  requestFinishNodeChainMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void
): AnnotationModeSession => {
  const activeOpenPlanarMeasurement = useMemo(
    () =>
      activePlanarMeasurementId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activePlanarMeasurementId &&
              !measurement.closed
          ) ?? null
        : null,
    [activePlanarMeasurementId, nodeChainMeasurements]
  );
  const hasActiveDraft = Boolean(activeOpenPlanarMeasurement);

  const requestStart = useCallback(() => {
    requestStartNodeChainToolMode();
  }, [requestStartNodeChainToolMode]);

  const requestClose = useCallback(() => {
    if (!activeOpenPlanarMeasurement) {
      return;
    }

    const minimumNodeCount = toolType === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    if (activeOpenPlanarMeasurement.nodeIds.length >= minimumNodeCount) {
      requestFinishNodeChainMeasurement();
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenPlanarMeasurement.id);
  }, [
    activeOpenPlanarMeasurement,
    discardNodeChainMeasurementDraft,
    requestFinishNodeChainMeasurement,
    toolType,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenPlanarMeasurement) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenPlanarMeasurement.id);
  }, [activeOpenPlanarMeasurement, discardNodeChainMeasurementDraft]);

  return useMemo(
    () => ({
      toolType,
      hasActiveDraft: () => hasActiveDraft,
      requestStart,
      requestClose,
      discardDraft,
    }),
    [discardDraft, hasActiveDraft, requestClose, requestStart, toolType]
  );
};
