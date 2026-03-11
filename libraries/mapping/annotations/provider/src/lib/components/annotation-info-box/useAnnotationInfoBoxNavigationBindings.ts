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
  useNodeChainAnnotationReadModel,
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
  const nodeChainReadModel = useNodeChainAnnotationReadModel();

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
      return nodeChainReadModel.measurements.map((measurement) => ({
        id: measurement.id,
      }));
    }
    return annotations.getNavigationItems().map((entry) => ({ id: entry.id }));
  }, [
    annotationType,
    annotations,
    labelMeasurements,
    nodeChainReadModel.measurements,
  ]);

  const isNodeChainAnnotationType =
    annotationType === ANNOTATION_TYPE_POLYLINE ||
    annotationType === ANNOTATION_TYPE_AREA_GROUND ||
    annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
    annotationType === ANNOTATION_TYPE_AREA_VERTICAL;

  const currentNavigationId = useMemo(() => {
    if (!isNodeChainAnnotationType) {
      return currentMeasurementId;
    }

    const activeNodeChainAnnotation =
      nodeChainReadModel.activeMeasurementId !== null
        ? nodeChainReadModel.measurements.find(
            (measurement) =>
              measurement.id === nodeChainReadModel.activeMeasurementId
          ) ?? null
        : null;
    const requiredVertexCount =
      activeNodeChainAnnotation?.type === ANNOTATION_TYPE_POLYLINE ? 2 : 3;
    const canUseActiveNodeChainAnnotation =
      activeNodeChainAnnotation !== null &&
      activeNodeChainAnnotation.nodeIds.length >= requiredVertexCount;

    return canUseActiveNodeChainAnnotation
      ? activeNodeChainAnnotation.id
      : nodeChainReadModel.focusedMeasurementId;
  }, [
    currentMeasurementId,
    isNodeChainAnnotationType,
    nodeChainReadModel.activeMeasurementId,
    nodeChainReadModel.focusedMeasurementId,
    nodeChainReadModel.measurements,
  ]);

  const handleNavigationSelection = (id: string | null) => {
    if (isNodeChainAnnotationType) {
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
