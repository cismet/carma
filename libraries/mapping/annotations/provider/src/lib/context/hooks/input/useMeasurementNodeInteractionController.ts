import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  PLANAR_TOOL_CREATION_MODE_POLYGON,
  type AnnotationCollection,
  type AnnotationMode,
  type PlanarPolygonGroup,
  type PlanarToolCreationMode,
} from "@carma-mapping/annotations/core";

const EMPTY_INTERACTIVE_POINT_ID_SET = new Set<string>();

type UseMeasurementNodeInteractionControllerParams = {
  annotations: AnnotationCollection;
  annotationMode: AnnotationMode;
  selectionModeActive: boolean;
  effectiveSelectModeAdditive: boolean;
  selectablePointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  pointQueryEnabled: boolean;
  hasCandidateNode: boolean;
  isActiveDrawMode: boolean;
  distanceModeStickyToFirstPoint: boolean;
  activePlanarPolygonGroupId: string | null;
  planarPolygonGroups: readonly PlanarPolygonGroup[];
  planarToolCreationMode: PlanarToolCreationMode;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  selectMeasurementById: (id: string) => void;
  setMoveGizmoPointElevationFromMeasurementById: (id: string) => void;
  syncAnnotationCursorToExistingPoint: (
    pointId: string,
    anchorPosition?: { x: number; y: number } | null
  ) => boolean;
  scheduleAnnotationCursorSnapRelease: (pointId: string) => void;
  resolveDistanceRelationSourcePointId: (
    targetPointId: string
  ) => string | null;
  appendExistingPointToActivePlanarPolygonGroup: (
    existingPointId: string,
    sourcePointId?: string | null
  ) => boolean | void;
  upsertDirectDistanceRelation: (
    sourcePointId: string,
    targetPointId: string
  ) => void;
  closeActivePlanarPolygonGroup: () => void;
  finishActivePlanarPolylineGroup: () => void;
  setDoubleClickChainSourcePointId: (pointId: string | null) => void;
  handleDefaultPointNodeClick: (pointId: string) => void;
};

const getActiveOpenPlanarGroup = (
  planarPolygonGroups: readonly PlanarPolygonGroup[],
  activePlanarPolygonGroupId: string | null
) =>
  activePlanarPolygonGroupId !== null
    ? planarPolygonGroups.find(
        (group) => group.id === activePlanarPolygonGroupId && !group.closed
      ) ?? null
    : null;

export const useMeasurementNodeInteractionController = ({
  annotations,
  annotationMode,
  selectionModeActive,
  effectiveSelectModeAdditive,
  selectablePointIds,
  moveGizmoPointId,
  isMoveGizmoDragging,
  pointQueryEnabled,
  hasCandidateNode,
  isActiveDrawMode,
  distanceModeStickyToFirstPoint,
  activePlanarPolygonGroupId,
  planarPolygonGroups,
  planarToolCreationMode,
  selectMeasurementIds,
  selectMeasurementById,
  setMoveGizmoPointElevationFromMeasurementById,
  syncAnnotationCursorToExistingPoint,
  scheduleAnnotationCursorSnapRelease,
  resolveDistanceRelationSourcePointId,
  appendExistingPointToActivePlanarPolygonGroup,
  upsertDirectDistanceRelation,
  closeActivePlanarPolygonGroup,
  finishActivePlanarPolylineGroup,
  setDoubleClickChainSourcePointId,
  handleDefaultPointNodeClick,
}: UseMeasurementNodeInteractionControllerParams) => {
  const allowInteractiveNodeCursorSnap =
    pointQueryEnabled &&
    hasCandidateNode &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;

  const interactivePointIds = useMemo(
    () =>
      allowInteractiveNodeCursorSnap
        ? selectablePointIds
        : EMPTY_INTERACTIVE_POINT_ID_SET,
    [allowInteractiveNodeCursorSnap, selectablePointIds]
  );

  const handlePointNodeHoverChange = useCallback(
    (
      pointId: string,
      hovered: boolean,
      anchorPosition?: { x: number; y: number } | null
    ) => {
      if (!allowInteractiveNodeCursorSnap) return;
      if (hovered) {
        syncAnnotationCursorToExistingPoint(pointId, anchorPosition);
        return;
      }
      if (!anchorPosition) {
        return;
      }
      scheduleAnnotationCursorSnapRelease(pointId);
    },
    [
      allowInteractiveNodeCursorSnap,
      scheduleAnnotationCursorSnapRelease,
      syncAnnotationCursorToExistingPoint,
    ]
  );

  const handlePointNodeClick = useCallback(
    (pointId: string) => {
      if (moveGizmoPointId) {
        setMoveGizmoPointElevationFromMeasurementById(pointId);
        return;
      }

      if (selectionModeActive) {
        selectMeasurementIds([pointId], effectiveSelectModeAdditive);
        return;
      }

      const clickedMeasurement = annotations.find(
        (measurement) => measurement.id === pointId
      );
      const isAuxiliaryLabelAnchor = Boolean(
        clickedMeasurement?.auxiliaryLabelAnchor
      );

      if (annotationMode === ANNOTATION_TYPE_POINT) {
        selectMeasurementById(pointId);
        return;
      }

      if (
        (annotationMode === ANNOTATION_TYPE_DISTANCE ||
          annotationMode === ANNOTATION_TYPE_POLYLINE) &&
        !selectablePointIds.has(pointId)
      ) {
        return;
      }

      if (isAuxiliaryLabelAnchor) {
        selectMeasurementById(pointId);
        return;
      }

      if (
        annotationMode === ANNOTATION_TYPE_DISTANCE ||
        annotationMode === ANNOTATION_TYPE_POLYLINE
      ) {
        syncAnnotationCursorToExistingPoint(pointId);
      }

      if (annotationMode === ANNOTATION_TYPE_DISTANCE) {
        const sourcePointId = resolveDistanceRelationSourcePointId(pointId);
        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, pointId);
          setDoubleClickChainSourcePointId(
            distanceModeStickyToFirstPoint ? sourcePointId : null
          );
          selectMeasurementById(pointId);
          return;
        }

        setDoubleClickChainSourcePointId(pointId);
        selectMeasurementById(pointId);
        return;
      }

      if (annotationMode === ANNOTATION_TYPE_POLYLINE) {
        if (!isActiveDrawMode) {
          appendExistingPointToActivePlanarPolygonGroup(pointId, null);
          setDoubleClickChainSourcePointId(pointId);
          selectMeasurementById(pointId);
          return;
        }

        const activeOpenGroup = getActiveOpenPlanarGroup(
          planarPolygonGroups,
          activePlanarPolygonGroupId
        );
        const firstVertexId = activeOpenGroup?.vertexPointIds[0] ?? null;
        const shouldHandleRingClosure = Boolean(
          firstVertexId &&
            firstVertexId === pointId &&
            activeOpenGroup &&
            activeOpenGroup.vertexPointIds.length >= 3
        );
        if (shouldHandleRingClosure) {
          if (planarToolCreationMode === PLANAR_TOOL_CREATION_MODE_POLYGON) {
            closeActivePlanarPolygonGroup();
          } else {
            finishActivePlanarPolylineGroup();
          }
          return;
        }

        const sourcePointId = resolveDistanceRelationSourcePointId(pointId);
        const didAppendExistingPoint = Boolean(
          appendExistingPointToActivePlanarPolygonGroup(pointId, sourcePointId)
        );
        if (didAppendExistingPoint) {
          return;
        }

        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, pointId);
        }

        setDoubleClickChainSourcePointId(pointId);
        selectMeasurementById(pointId);
        return;
      }

      handleDefaultPointNodeClick(pointId);
    },
    [
      moveGizmoPointId,
      setMoveGizmoPointElevationFromMeasurementById,
      selectionModeActive,
      selectMeasurementIds,
      effectiveSelectModeAdditive,
      annotations,
      annotationMode,
      selectablePointIds,
      selectMeasurementById,
      syncAnnotationCursorToExistingPoint,
      resolveDistanceRelationSourcePointId,
      upsertDirectDistanceRelation,
      setDoubleClickChainSourcePointId,
      distanceModeStickyToFirstPoint,
      isActiveDrawMode,
      appendExistingPointToActivePlanarPolygonGroup,
      planarPolygonGroups,
      activePlanarPolygonGroupId,
      planarToolCreationMode,
      closeActivePlanarPolygonGroup,
      finishActivePlanarPolylineGroup,
      handleDefaultPointNodeClick,
    ]
  );

  return {
    interactivePointIds,
    handlePointNodeClick,
    handlePointNodeHoverChange,
  } as const;
};
