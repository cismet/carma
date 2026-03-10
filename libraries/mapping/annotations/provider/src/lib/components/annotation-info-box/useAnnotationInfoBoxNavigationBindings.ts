import { useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POLYLINE,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { AnnotationSlotKind } from "./getAnnotationInfoBoxSlots";
import {
  useAnnotationCollection,
  usePlanarAnnotationReadModel,
  useAnnotationSelectionState,
} from "../../context/AnnotationsProvider";

export type AnnotationInfoBoxNavigationBindings = {
  navigationMeasurements: ReadonlyArray<{ id: string }>;
  currentNavigationId: string | null;
  handleNavigationSelection: (id: string | null) => void;
  handleNavigationFlyTo: (id: string) => void;
  onFlyToAllMeasurements: () => void;
};

export const useAnnotationInfoBoxNavigationBindings = (
  annotationType: AnnotationSlotKind,
  currentMeasurementId: string | null,
  labelMeasurements: ReadonlyArray<PointAnnotationEntry>
): AnnotationInfoBoxNavigationBindings => {
  const annotations = useAnnotationCollection();
  const selection = useAnnotationSelectionState();
  const planarReadModel = usePlanarAnnotationReadModel();

  const navigationMeasurements = useMemo(() => {
    if (annotationType === ANNOTATION_TYPE_LABEL) {
      return labelMeasurements.map((entry) => ({ id: entry.id }));
    }
    if (
      annotationType === ANNOTATION_TYPE_POLYLINE ||
      annotationType === ANNOTATION_TYPE_AREA_GROUND ||
      annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
      annotationType === ANNOTATION_TYPE_AREA_VERTICAL
    ) {
      return planarReadModel.measurements.map((measurement) => ({
        id: measurement.id,
      }));
    }
    return annotations.getNavigationItems().map((entry) => ({ id: entry.id }));
  }, [
    annotationType,
    annotations,
    labelMeasurements,
    planarReadModel.measurements,
  ]);

  const isPlanarAnnotationType =
    annotationType === ANNOTATION_TYPE_POLYLINE ||
    annotationType === ANNOTATION_TYPE_AREA_GROUND ||
    annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
    annotationType === ANNOTATION_TYPE_AREA_VERTICAL;

  const currentNavigationId = useMemo(() => {
    if (!isPlanarAnnotationType) {
      return currentMeasurementId;
    }

    const activePlanarGroup =
      planarReadModel.activeMeasurementId !== null
        ? planarReadModel.measurements.find(
            (measurement) =>
              measurement.id === planarReadModel.activeMeasurementId
          ) ?? null
        : null;
    const requiredVertexCount =
      activePlanarGroup?.type === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    const canUseActivePlanarGroup =
      activePlanarGroup !== null &&
      activePlanarGroup.nodeIds.length >= requiredVertexCount;

    return canUseActivePlanarGroup
      ? activePlanarGroup.id
      : planarReadModel.focusedMeasurementId;
  }, [
    currentMeasurementId,
    isPlanarAnnotationType,
    planarReadModel.activeMeasurementId,
    planarReadModel.focusedMeasurementId,
    planarReadModel.measurements,
  ]);

  const handleNavigationSelection = (id: string | null) => {
    if (isPlanarAnnotationType) {
      annotations.focusById(id);
      return;
    }
    selection.set(id ? [id] : []);
  };

  const handleNavigationFlyTo = (id: string) => {
    annotations.flyToById(id);
  };

  return {
    navigationMeasurements,
    currentNavigationId,
    handleNavigationSelection,
    handleNavigationFlyTo,
    onFlyToAllMeasurements: annotations.flyToAll,
  };
};
