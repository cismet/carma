import { useMemo } from "react";

import {
  type AnnotationEntry,
  type AnnotationMode,
  useAnnotations,
} from "@carma-mapping/annotations/core";
import type { AnnotationSlotActions } from "./getAnnotationInfoBoxSlots";
import { useAnnotationsAdapter } from "../../context/AnnotationsAdapterProvider";

export const useAnnotationInfoBoxSlotActions = (): AnnotationSlotActions => {
  const {
    annotations,
    setAnnotations,
    updateAnnotationNameById,
    updateAnnotationById,
    deleteAnnotationById,
    toggleAnnotationLockById,
    updatePointLabelAppearanceById,
    confirmPointLabelInputById,
    clearAnnotationsByIds,
  } = useAnnotations<AnnotationMode, AnnotationEntry>();
  const {
    flyToMeasurementById,
    setReferencePoint,
    planarPolygonGroups,
    setPlanarPolygonGroups,
    updatePlanarPolygonNameById,
    selectPlanarPolygonGroupById,
  } = useAnnotationsAdapter();

  return useMemo<AnnotationSlotActions>(
    () => ({
      updateAnnotationNameById,
      updateAnnotationById,
      deleteAnnotationById,
      toggleAnnotationLockById,
      flyToMeasurementById,
      flyToPlanarPolygonGroupById: (groupId: string) => {
        const group = planarPolygonGroups.find((entry) => entry.id === groupId);
        const firstVertexId = group?.vertexPointIds[0];
        if (!firstVertexId) return;
        flyToMeasurementById(firstVertexId);
      },
      togglePlanarPolygonGroupVisibilityById: (groupId: string) => {
        setPlanarPolygonGroups((prev) =>
          prev.map((group) =>
            group.id === groupId
              ? {
                  ...group,
                  hidden: !group.hidden,
                }
              : group
          )
        );
      },
      togglePlanarPolygonGroupLockById: (groupId: string) => {
        const group = planarPolygonGroups.find((entry) => entry.id === groupId);
        if (!group || group.vertexPointIds.length === 0) return;
        const vertexIdSet = new Set(group.vertexPointIds);
        const shouldLock = group.vertexPointIds.some((vertexId) => {
          const vertex = annotations.find((entry) => entry.id === vertexId);
          return !vertex?.locked;
        });
        setAnnotations((prev) =>
          prev.map((entry) =>
            vertexIdSet.has(entry.id)
              ? {
                  ...entry,
                  locked: shouldLock,
                }
              : entry
          )
        );
      },
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
        clearAnnotationsByIds(vertexIds);
        selectPlanarPolygonGroupById(null);
      },
    }),
    [
      annotations,
      clearAnnotationsByIds,
      confirmPointLabelInputById,
      deleteAnnotationById,
      flyToMeasurementById,
      planarPolygonGroups,
      selectPlanarPolygonGroupById,
      setAnnotations,
      setPlanarPolygonGroups,
      setReferencePoint,
      toggleAnnotationLockById,
      updateAnnotationById,
      updateAnnotationNameById,
      updatePlanarPolygonNameById,
      updatePointLabelAppearanceById,
    ]
  );
};
