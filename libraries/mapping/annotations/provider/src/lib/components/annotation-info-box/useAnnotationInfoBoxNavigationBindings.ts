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
  useAnnotationSelectionState,
  useAnnotationViewState,
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
  const view = useAnnotationViewState();

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
      return view.planarMeasurements.map((measurement) => ({
        id: measurement.id,
      }));
    }
    return annotations.getNavigationItems().map((entry) => ({ id: entry.id }));
  }, [annotationType, annotations, labelMeasurements, view.planarMeasurements]);

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
      view.activePlanarMeasurementId !== null
        ? view.planarMeasurements.find(
            (measurement) => measurement.id === view.activePlanarMeasurementId
          ) ?? null
        : null;
    const requiredVertexCount =
      activePlanarGroup?.type === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    const canUseActivePlanarGroup =
      activePlanarGroup !== null &&
      activePlanarGroup.vertexPointIds.length >= requiredVertexCount;

    return canUseActivePlanarGroup
      ? activePlanarGroup.id
      : view.focusedPlanarMeasurementId;
  }, [
    currentMeasurementId,
    isPlanarAnnotationType,
    view.activePlanarMeasurementId,
    view.focusedPlanarMeasurementId,
    view.planarMeasurements,
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
