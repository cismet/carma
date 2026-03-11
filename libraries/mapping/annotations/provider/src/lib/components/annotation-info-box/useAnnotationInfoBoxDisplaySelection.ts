import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type AnnotationToolType,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import {
  useCandidateAnnotation,
  useAnnotationCollection,
  useAnnotationSelectionState,
  useAnnotationTools,
} from "../../context/AnnotationsProvider";

export type AnnotationInfoBoxDisplaySelection = {
  activeToolType: AnnotationToolType;
  isPointCandidateModeActive: boolean;
  isDistanceCandidateModeActive: boolean;
  pointEntries: ReadonlyArray<PointAnnotationEntry>;
  currentMeasurement: PointAnnotationEntry | null;
  displayMeasurement: PointAnnotationEntry | null;
};

export const useAnnotationInfoBoxDisplaySelection =
  (): AnnotationInfoBoxDisplaySelection => {
    const tools = useAnnotationTools();
    const annotations = useAnnotationCollection();
    const selection = useAnnotationSelectionState();
    const candidateAnnotation = useCandidateAnnotation();

    const isPointCandidateModeActive =
      tools.activeToolType === ANNOTATION_TYPE_POINT;
    const isDistanceCandidateModeActive =
      tools.activeToolType === ANNOTATION_TYPE_DISTANCE;
    const primarySelectedAnnotationId =
      selection.ids[selection.ids.length - 1] ?? null;
    const effectiveMeasurementId = isPointCandidateModeActive
      ? primarySelectedAnnotationId ?? selection.activeAnnotationId
      : isDistanceCandidateModeActive
      ? selection.activeAnnotationId ?? primarySelectedAnnotationId
      : primarySelectedAnnotationId ?? selection.activeAnnotationId;

    const pointEntries = useMemo(
      () => annotations.items.filter(isPointAnnotationEntry),
      [annotations.items]
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
        candidateAnnotation && isPointAnnotationEntry(candidateAnnotation)
          ? candidateAnnotation
          : null,
      [candidateAnnotation]
    );

    const displayMeasurement = useMemo(
      () =>
        isPointCandidateModeActive
          ? currentMeasurement
          : isDistanceCandidateModeActive
          ? candidateMeasurement
          : currentMeasurement,
      [
        currentMeasurement,
        isDistanceCandidateModeActive,
        isPointCandidateModeActive,
        candidateMeasurement,
      ]
    );

    return {
      activeToolType: tools.activeToolType,
      isPointCandidateModeActive,
      isDistanceCandidateModeActive,
      pointEntries,
      currentMeasurement,
      displayMeasurement,
    };
  };
