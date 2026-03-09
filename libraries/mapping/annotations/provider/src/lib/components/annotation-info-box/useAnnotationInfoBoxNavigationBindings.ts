import { useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POLYLINE,
  useAnnotations,
  useAnnotationSelection,
} from "@carma-mapping/annotations/core";
import type {
  AnnotationEntry,
  AnnotationMode,
  PointAnnotationEntry,
} from "@carma-mapping/annotations/core";
import type { AnnotationSlotKind } from "./getAnnotationInfoBoxSlots";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";

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
  const { getAnnotationsForNavigation } = useAnnotations<
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
  } = useAnnotationsAdapter();

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
    return getAnnotationsForNavigation().map((entry) => ({ id: entry.id }));
  }, [
    annotationType,
    getAnnotationsForNavigation,
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
