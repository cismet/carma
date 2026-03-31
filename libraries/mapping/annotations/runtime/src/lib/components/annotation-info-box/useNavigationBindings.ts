import { useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POLYLINE,
} from "@carma-mapping/annotations/core";

import { useCollection, useSelectionState } from "../../store";
import type { AnnotationInfoBoxEntryPayload } from "./getAnnotationInfoBoxSlots";
export type AnnotationInfoBoxNavigationBindings = {
  navigationMeasurements: ReadonlyArray<{ id: string }>;
  currentNavigationId: string | null;
  handleNavigationSelection: (id: string | null) => void;
  handleNavigationFlyTo: (id: string) => void;
  onFlyToAllMeasurements: () => void;
};

export const useNavigationBindings = (
  payload: AnnotationInfoBoxEntryPayload
): AnnotationInfoBoxNavigationBindings => {
  const annotations = useCollection();
  const selection = useSelectionState();

  const navigationMeasurements = useMemo(() => {
    if (payload.kind === ANNOTATION_TYPE_LABEL) {
      return payload.labelMeasurements.map((entry) => ({ id: entry.id }));
    }
    if (payload.kind === ANNOTATION_TYPE_POLYLINE) {
      return payload.polylineAnnotations.map((measurement) => ({
        id: measurement.id,
      }));
    }
    if (payload.kind === ANNOTATION_TYPE_AREA_GROUND) {
      return payload.groundPolygons.map((measurement) => ({
        id: measurement.id,
      }));
    }
    if (payload.kind === ANNOTATION_TYPE_AREA_PLANAR) {
      return payload.planarPolygons.map((measurement) => ({
        id: measurement.id,
      }));
    }
    if (payload.kind === ANNOTATION_TYPE_AREA_VERTICAL) {
      return payload.verticalPolygons.map((measurement) => ({
        id: measurement.id,
      }));
    }
    return annotations.getNavigationItems().map((entry) => ({ id: entry.id }));
  }, [
    annotations,
    payload.groundPolygons,
    payload.kind,
    payload.labelMeasurements,
    payload.planarPolygons,
    payload.polylineAnnotations,
    payload.verticalPolygons,
  ]);

  const isNodeChainAnnotationType =
    payload.kind === ANNOTATION_TYPE_POLYLINE ||
    payload.kind === ANNOTATION_TYPE_AREA_GROUND ||
    payload.kind === ANNOTATION_TYPE_AREA_PLANAR ||
    payload.kind === ANNOTATION_TYPE_AREA_VERTICAL;

  const currentNavigationId = payload.annotationId;

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
