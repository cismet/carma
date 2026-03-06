import { useMemo } from "react";

import type {
  AnnotationEntry,
  AnnotationMode,
  PointAnnotationEntry,
} from "@carma-mapping/annotations/cesium";
import { useCesiumAnnotations } from "@carma-mapping/annotations/cesium";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POLYLINE,
  useAnnotationMeasurements,
  useAnnotationSelection,
} from "@carma-mapping/annotations/core";
import type { AnnotationSlotKind } from "./getAnnotationInfoBoxSlots";

type UseAnnotationInfoBoxNavigationBindingsParams = {
  annotationType: AnnotationSlotKind;
  currentMeasurementId: string | null;
  labelMeasurements: ReadonlyArray<PointAnnotationEntry>;
};

export type AnnotationInfoBoxNavigationBindings = {
  navigationMeasurements: ReadonlyArray<{ id: string }>;
  currentNavigationId: string | null;
  handleNavigationSelection: (id: string | null) => void;
  handleNavigationFlyTo: (id: string) => void;
  onFlyToAllMeasurements: () => void;
};

export const useAnnotationInfoBoxNavigationBindings = ({
  annotationType,
  currentMeasurementId,
  labelMeasurements,
}: UseAnnotationInfoBoxNavigationBindingsParams): AnnotationInfoBoxNavigationBindings => {
  const { getMeasurementsForNavigation } = useAnnotationMeasurements<
    AnnotationMode,
    AnnotationEntry
  >();
  const { selectMeasurementById } = useAnnotationSelection();
  const {
    planarPolygonGroups,
    activePlanarPolygonGroupId,
    selectedPlanarPolygonGroupId,
    selectPlanarPolygonGroupById,
    flyToMeasurementById,
    flyToAllMeasurements,
  } = useCesiumAnnotations();

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
      return planarPolygonGroups.map((group) => ({ id: group.id }));
    }
    return getMeasurementsForNavigation().map((entry) => ({ id: entry.id }));
  }, [
    annotationType,
    getMeasurementsForNavigation,
    labelMeasurements,
    planarPolygonGroups,
  ]);

  const currentNavigationId =
    annotationType === ANNOTATION_TYPE_POLYLINE ||
    annotationType === ANNOTATION_TYPE_AREA_GROUND ||
    annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
    annotationType === ANNOTATION_TYPE_AREA_VERTICAL
      ? activePlanarPolygonGroupId ?? selectedPlanarPolygonGroupId
      : currentMeasurementId;

  const handleNavigationSelection = (id: string | null) => {
    if (
      annotationType === ANNOTATION_TYPE_POLYLINE ||
      annotationType === ANNOTATION_TYPE_AREA_GROUND ||
      annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
      annotationType === ANNOTATION_TYPE_AREA_VERTICAL
    ) {
      selectPlanarPolygonGroupById(id);
      return;
    }
    selectMeasurementById(id);
  };

  const handleNavigationFlyTo = (id: string) => {
    if (
      annotationType === ANNOTATION_TYPE_POLYLINE ||
      annotationType === ANNOTATION_TYPE_AREA_GROUND ||
      annotationType === ANNOTATION_TYPE_AREA_PLANAR ||
      annotationType === ANNOTATION_TYPE_AREA_VERTICAL
    ) {
      const group = planarPolygonGroups.find((entry) => entry.id === id);
      const firstVertexId = group?.vertexPointIds[0] ?? null;
      if (firstVertexId) {
        flyToMeasurementById(firstVertexId);
      }
      return;
    }
    flyToMeasurementById(id);
  };

  return {
    navigationMeasurements,
    currentNavigationId,
    handleNavigationSelection,
    handleNavigationFlyTo,
    onFlyToAllMeasurements: flyToAllMeasurements,
  };
};
