import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";

import {
  ANNOTATION_TYPE_POLYLINE,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const useNodeChainMeasureModeSession = (
  toolType: NodeChainAnnotation["type"],
  activeNodeChainAnnotationId: string | null,
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartNodeChainToolMode: () => void,
  requestFinishNodeChainMeasurement: () => void,
  discardNodeChainMeasurementDraft: (measurementId: string) => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeOpenNodeChainAnnotation = useMemo(
    () =>
      activeNodeChainAnnotationId !== null
        ? nodeChainMeasurements.find(
            (measurement) =>
              measurement.id === activeNodeChainAnnotationId &&
              !measurement.closed
          ) ?? null
        : null,
    [activeNodeChainAnnotationId, nodeChainMeasurements]
  );
  const hasActiveDraft = Boolean(activeOpenNodeChainAnnotation);

  const requestStart = useCallback(() => {
    requestStartNodeChainToolMode();
  }, [requestStartNodeChainToolMode]);

  const requestClose = useCallback(() => {
    if (!activeOpenNodeChainAnnotation) {
      return;
    }

    const minimumNodeCount = toolType === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    if (activeOpenNodeChainAnnotation.nodeIds.length >= minimumNodeCount) {
      requestFinishNodeChainMeasurement();
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenNodeChainAnnotation.id);
  }, [
    activeOpenNodeChainAnnotation,
    discardNodeChainMeasurementDraft,
    requestFinishNodeChainMeasurement,
    toolType,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeOpenNodeChainAnnotation) {
      return;
    }

    discardNodeChainMeasurementDraft(activeOpenNodeChainAnnotation.id);
  }, [activeOpenNodeChainAnnotation, discardNodeChainMeasurementDraft]);

  return useMemo(
    () => ({
      toolType,
      hasActiveDraft: () => hasActiveDraft,
      requestStart,
      requestClose,
      discardDraft,
      onNodeCreated,
    }),
    [
      discardDraft,
      hasActiveDraft,
      onNodeCreated,
      requestClose,
      requestStart,
      toolType,
    ]
  );
};
