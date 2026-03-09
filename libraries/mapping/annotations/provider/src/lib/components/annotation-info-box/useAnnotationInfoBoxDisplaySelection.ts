import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type AnnotationEntry,
  type AnnotationMode,
  type PointAnnotationEntry,
  useAnnotations,
  useAnnotationSelection,
} from "@carma-mapping/annotations/core";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";

export type AnnotationInfoBoxDisplaySelection = {
  annotationMode: AnnotationMode;
  pointLabelOnCreate: boolean;
  isPointModeLivePreviewActive: boolean;
  isDistanceModeLivePreviewActive: boolean;
  pointMeasurements: ReadonlyArray<PointAnnotationEntry>;
  currentMeasurement: PointAnnotationEntry | null;
  displayMeasurement: PointAnnotationEntry | null;
};

export const useAnnotationInfoBoxDisplaySelection =
  (): AnnotationInfoBoxDisplaySelection => {
    const {
      annotationMode,
      annotations,
      liveAnnotationCandidate,
      pointLabelOnCreate,
    } = useAnnotations<AnnotationMode, AnnotationEntry>();
    const { selectedMeasurementId } = useAnnotationSelection();
    const { activeMeasurementId } = useAnnotationsAdapter();

    const isPointModeLivePreviewActive =
      annotationMode === ANNOTATION_TYPE_POINT && !pointLabelOnCreate;
    const isDistanceModeLivePreviewActive =
      annotationMode === ANNOTATION_TYPE_DISTANCE;
    const isLivePreviewMode =
      isPointModeLivePreviewActive || isDistanceModeLivePreviewActive;

    const effectiveMeasurementId = isLivePreviewMode
      ? activeMeasurementId ?? selectedMeasurementId
      : selectedMeasurementId ?? activeMeasurementId;

    const pointMeasurements = useMemo(
      () => annotations.filter(isPointAnnotationEntry),
      [annotations]
    );

    const currentMeasurement = useMemo(
      () =>
        pointMeasurements.find(
          (measurement) => measurement.id === effectiveMeasurementId
        ) ?? null,
      [effectiveMeasurementId, pointMeasurements]
    );

    const livePreviewMeasurement = useMemo(
      () =>
        liveAnnotationCandidate &&
        isPointAnnotationEntry(liveAnnotationCandidate)
          ? liveAnnotationCandidate
          : null,
      [liveAnnotationCandidate]
    );

    const displayMeasurement = useMemo(
      () =>
        livePreviewMeasurement
          ? livePreviewMeasurement
          : isPointModeLivePreviewActive || isDistanceModeLivePreviewActive
          ? null
          : currentMeasurement,
      [
        currentMeasurement,
        isDistanceModeLivePreviewActive,
        isPointModeLivePreviewActive,
        livePreviewMeasurement,
      ]
    );

    return {
      annotationMode,
      pointLabelOnCreate,
      isPointModeLivePreviewActive,
      isDistanceModeLivePreviewActive,
      pointMeasurements,
      currentMeasurement,
      displayMeasurement,
    };
  };
