import { useCallback, useMemo } from "react";
import type { Cartesian3 } from "@carma/cesium";

import {
  ANNOTATION_TYPE_DISTANCE,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";

import type { AnnotationModeSession } from "../annotationModeSession.types";

export const useDistanceMeasureModeSession = (
  openChainPointId: string | null,
  selectablePointIds: ReadonlySet<string>,
  selectedAnnotationId: string | null,
  distanceRelations: readonly PointDistanceRelation[],
  nodeChainMeasurements: readonly NodeChainAnnotation[],
  requestStartDistanceMode: () => void,
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void,
  discardDistanceMeasurementDraft: () => void,
  onNodeCreated: (id: string, positionECEF: Cartesian3) => void
): AnnotationModeSession => {
  const activeDistanceSourcePointId =
    openChainPointId && selectablePointIds.has(openChainPointId)
      ? openChainPointId
      : null;
  const hasActiveDraft = Boolean(activeDistanceSourcePointId);

  const requestStart = useCallback(() => {
    requestStartDistanceMode();
  }, [requestStartDistanceMode]);

  const requestClose = useCallback(() => {
    if (!activeDistanceSourcePointId) {
      return;
    }

    const canPersistDistanceDraft =
      distanceRelations.some(
        (relation) =>
          relation.pointAId === activeDistanceSourcePointId ||
          relation.pointBId === activeDistanceSourcePointId
      ) ||
      nodeChainMeasurements.some((measurement) =>
        measurement.nodeIds.includes(activeDistanceSourcePointId)
      );

    if (canPersistDistanceDraft) {
      finishDistanceMeasurementSession(selectedAnnotationId);
      return;
    }

    discardDistanceMeasurementDraft();
  }, [
    activeDistanceSourcePointId,
    discardDistanceMeasurementDraft,
    distanceRelations,
    finishDistanceMeasurementSession,
    nodeChainMeasurements,
    selectedAnnotationId,
  ]);

  const discardDraft = useCallback(() => {
    if (!activeDistanceSourcePointId) {
      return;
    }

    discardDistanceMeasurementDraft();
  }, [activeDistanceSourcePointId, discardDistanceMeasurementDraft]);

  return useMemo(
    () => ({
      toolType: ANNOTATION_TYPE_DISTANCE,
      hasActiveDraft: () => hasActiveDraft,
      requestStart,
      requestClose,
      discardDraft,
      onNodeCreated,
    }),
    [discardDraft, hasActiveDraft, onNodeCreated, requestClose, requestStart]
  );
};
