import { useMemo } from "react";

import {
  isPointAnnotationEntry,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  type AnnotationToolType,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import {
  useAnnotationCollection,
  useAnnotationSelectionState,
  useAnnotationTools,
  useAnnotationViewState,
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
    const view = useAnnotationViewState();

    const isPointCandidateModeActive =
      tools.activeToolType === ANNOTATION_TYPE_POINT;
    const isDistanceCandidateModeActive =
      tools.activeToolType === ANNOTATION_TYPE_DISTANCE;
    const effectiveMeasurementId = isPointCandidateModeActive
      ? selection.primaryId ?? selection.activeAnnotationId
      : isDistanceCandidateModeActive
      ? selection.activeAnnotationId ?? selection.primaryId
      : selection.primaryId ?? selection.activeAnnotationId;

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
        view.candidateAnnotation &&
        isPointAnnotationEntry(view.candidateAnnotation)
          ? view.candidateAnnotation
          : null,
      [view.candidateAnnotation]
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
