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
  isPointCandidateModeActive: boolean;
  isDistanceCandidateModeActive: boolean;
  pointEntries: ReadonlyArray<PointAnnotationEntry>;
  currentMeasurement: PointAnnotationEntry | null;
  displayMeasurement: PointAnnotationEntry | null;
};

export const useAnnotationInfoBoxDisplaySelection =
  (): AnnotationInfoBoxDisplaySelection => {
    const {
      annotationMode,
      annotations,
      annotationCandidate,
      pointLabelOnCreate,
    } = useAnnotations<AnnotationMode, AnnotationEntry>();
    const { selectedMeasurementId } = useAnnotationSelection();
    const { activeMeasurementId } = useAnnotationsAdapter();

    const isPointCandidateModeActive =
      annotationMode === ANNOTATION_TYPE_POINT && !pointLabelOnCreate;
    const isDistanceCandidateModeActive =
      annotationMode === ANNOTATION_TYPE_DISTANCE;
    const isCandidateMode =
      isPointCandidateModeActive || isDistanceCandidateModeActive;

    const effectiveMeasurementId = isCandidateMode
      ? activeMeasurementId ?? selectedMeasurementId
      : selectedMeasurementId ?? activeMeasurementId;

    const pointEntries = useMemo(
      () => annotations.filter(isPointAnnotationEntry),
      [annotations]
    );
    const currentMeasurement = useMemo(
      () =>
        pointEntries.find(
          (measurement) => measurement.id === effectiveMeasurementId
        ) ?? null,
      [effectiveMeasurementId, pointEntries]
    );

    const candidateMeasurement = useMemo(
      () =>
        annotationCandidate && isPointAnnotationEntry(annotationCandidate)
          ? annotationCandidate
          : null,
      [annotationCandidate]
    );

    const displayMeasurement = useMemo(
      () =>
        candidateMeasurement
          ? candidateMeasurement
          : isPointCandidateModeActive || isDistanceCandidateModeActive
          ? null
          : currentMeasurement,
      [
        currentMeasurement,
        isDistanceCandidateModeActive,
        isPointCandidateModeActive,
        candidateMeasurement,
      ]
    );

    return {
      annotationMode,
      pointLabelOnCreate,
      isPointCandidateModeActive,
      isDistanceCandidateModeActive,
      pointEntries,
      currentMeasurement,
      displayMeasurement,
    };
  };
