import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_POLYLINE,
  type PlanarMeasurementGroup,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const usePlanarMeasureModeSession = (
  toolType: PlanarMeasurementGroup["type"],
  activePlanarMeasurementId: string | null,
  planarMeasurements: readonly PlanarMeasurementGroup[],
  requestStartPlanarToolMode: () => void,
  requestFinishPlanarMeasurement: () => void,
  discardPlanarMeasurementDraft: (measurementId: string) => void
): AnnotationModeSession => {
  const activeOpenPlanarMeasurement = useMemo(
    () =>
      activePlanarMeasurementId !== null
        ? planarMeasurements.find(
            (measurement) =>
              measurement.id === activePlanarMeasurementId &&
              !measurement.closed
          ) ?? null
        : null,
    [activePlanarMeasurementId, planarMeasurements]
  );
  const hasActiveDraft = Boolean(activeOpenPlanarMeasurement);

  const requestStart = useCallback(() => {
    requestStartPlanarToolMode();
  }, [requestStartPlanarToolMode]);

  const requestClose = useCallback(() => {
    if (!activeOpenPlanarMeasurement) {
      return;
    }

    const minimumVertexCount = toolType === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    if (
      activeOpenPlanarMeasurement.vertexPointIds.length >= minimumVertexCount
    ) {
      requestFinishPlanarMeasurement();
      return;
    }

    discardPlanarMeasurementDraft(activeOpenPlanarMeasurement.id);
  }, [
    activeOpenPlanarMeasurement,
    discardPlanarMeasurementDraft,
    requestFinishPlanarMeasurement,
    toolType,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenPlanarMeasurement) {
      return;
    }

    discardPlanarMeasurementDraft(activeOpenPlanarMeasurement.id);
  }, [activeOpenPlanarMeasurement, discardPlanarMeasurementDraft]);

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
