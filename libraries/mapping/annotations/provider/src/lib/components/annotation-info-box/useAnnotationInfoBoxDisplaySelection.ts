import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  MEASUREMENT_MODE_DISTANCE,
  MEASUREMENT_MODE_POINT,
  useCesiumAnnotations,
  type AnnotationEntry,
  type AnnotationMode,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import {
  useAnnotationMeasurements,
  useAnnotationSelection,
} from "@carma-mapping/annotations/core";

export type AnnotationInfoBoxDisplaySelection = {
  measurementMode: AnnotationMode;
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
      measurementMode,
      measurements,
      liveMeasurementCandidate,
      pointLabelOnCreate,
    } = useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
    const { selectedMeasurementId } = useAnnotationSelection();
    const { activeMeasurementId } = useCesiumAnnotations();

    const isPointModeLivePreviewActive =
      measurementMode === MEASUREMENT_MODE_POINT && !pointLabelOnCreate;
    const isDistanceModeLivePreviewActive =
      measurementMode === MEASUREMENT_MODE_DISTANCE;
    const isLivePreviewMode =
      isPointModeLivePreviewActive || isDistanceModeLivePreviewActive;

    const effectiveMeasurementId = isLivePreviewMode
      ? activeMeasurementId ?? selectedMeasurementId
      : selectedMeasurementId ?? activeMeasurementId;

    const pointMeasurements = useMemo(
      () => measurements.filter(isPointAnnotationEntry),
      [measurements]
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
        liveMeasurementCandidate &&
        isPointAnnotationEntry(liveMeasurementCandidate)
          ? liveMeasurementCandidate
          : null,
      [liveMeasurementCandidate]
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
      measurementMode,
      pointLabelOnCreate,
      isPointModeLivePreviewActive,
      isDistanceModeLivePreviewActive,
      pointMeasurements,
      currentMeasurement,
      displayMeasurement,
    };
  };
