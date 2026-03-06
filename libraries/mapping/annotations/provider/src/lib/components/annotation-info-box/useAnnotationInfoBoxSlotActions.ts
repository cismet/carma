import { useMemo } from "react";

import {
  useCesiumAnnotations,
  type AnnotationEntry,
  type AnnotationMode,
} from "@carma-mapping/annotations/cesium";
import { useAnnotationMeasurements } from "@carma-mapping/annotations/core";
import type { AnnotationSlotActions } from "./getAnnotationInfoBoxSlots";

export const useAnnotationInfoBoxSlotActions = (): AnnotationSlotActions => {
  const {
    updateMeasurementNameById,
    updateMeasurementById,
    deleteMeasurementById,
    toggleMeasurementLockById,
    updatePointLabelAppearanceById,
    confirmPointLabelInputById,
    clearMeasurementsByIds,
  } = useAnnotationMeasurements<AnnotationMode, AnnotationEntry>();
  const {
    flyToMeasurementById,
    setReferencePoint,
    planarPolygonGroups,
    setPlanarPolygonGroups,
    updatePlanarPolygonNameById,
    selectPlanarPolygonGroupById,
  } = useCesiumAnnotations();

  return useMemo<AnnotationSlotActions>(
    () => ({
      updateMeasurementNameById,
      updateMeasurementById,
      deleteMeasurementById,
      toggleMeasurementLockById,
      flyToMeasurementById,
      setReferencePoint,
      confirmPointLabelInputById,
      updatePointLabelAppearanceById,
      updatePlanarPolygonNameById,
      updatePlanarPolygonSegmentLineModeById: (groupId, nextMode) => {
        setPlanarPolygonGroups((prev) =>
          prev.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  segmentLineMode: nextMode,
                }
              : group
          )
        );
      },
      deletePlanarPolygonGroupById: (groupId: string) => {
        const group = planarPolygonGroups.find((entry) => entry.id === groupId);
        if (!group) return;
        const vertexIds = group.vertexPointIds.filter(
          (vertexId): vertexId is string => Boolean(vertexId)
        );
        if (vertexIds.length === 0) return;
        clearMeasurementsByIds(vertexIds);
        selectPlanarPolygonGroupById(null);
      },
    }),
    [
      clearMeasurementsByIds,
      confirmPointLabelInputById,
      deleteMeasurementById,
      flyToMeasurementById,
      planarPolygonGroups,
      selectPlanarPolygonGroupById,
      setPlanarPolygonGroups,
      setReferencePoint,
      toggleMeasurementLockById,
      updateMeasurementById,
      updateMeasurementNameById,
      updatePlanarPolygonNameById,
      updatePointLabelAppearanceById,
    ]
  );
};
