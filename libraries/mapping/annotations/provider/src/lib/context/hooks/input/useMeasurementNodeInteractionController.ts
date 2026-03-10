import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  type AnnotationCollection,
  type AnnotationToolType,
  type PlanarMeasurementGroup,
} from "@carma-mapping/annotations/core";
import { isAreaToolType } from "../../mode-lifecycle/annotationToolState";

const EMPTY_INTERACTIVE_POINT_ID_SET = new Set<string>();

type UseMeasurementNodeInteractionControllerParams = {
  activeToolType: AnnotationToolType;
  allowInteractiveNodeCursorSnap: boolean;
  selectionModeActive: boolean;
  effectiveSelectModeAdditive: boolean;
  selectablePointIds: ReadonlySet<string>;
  isActiveDrawMode: boolean;
  distanceModeStickyToFirstPoint: boolean;
  activePlanarMeasurementId: string | null;
  selectAnnotationIds: (ids: string[], additive?: boolean) => void;
  selectAnnotationById: (id: string) => void;
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
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void;
  setDoubleClickChainSourcePointId: (pointId: string | null) => void;
  handleDefaultPointNodeClick: (pointId: string) => void;
};

const getActiveOpenPlanarGroup = (
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  activePlanarMeasurementId: string | null
) =>
  activePlanarMeasurementId !== null
    ? planarPolygonGroups.find(
        (group) => group.id === activePlanarMeasurementId && !group.closed
      ) ?? null
    : null;

export const useMeasurementNodeInteractionController = (
  annotations: AnnotationCollection,
  planarPolygonGroups: readonly PlanarMeasurementGroup[],
  {
    activeToolType,
    allowInteractiveNodeCursorSnap,
    selectionModeActive,
    effectiveSelectModeAdditive,
    selectablePointIds,
    isActiveDrawMode,
    distanceModeStickyToFirstPoint,
    activePlanarMeasurementId,
    selectAnnotationIds,
    selectAnnotationById,
    syncAnnotationCursorToExistingPoint,
    scheduleAnnotationCursorSnapRelease,
    resolveDistanceRelationSourcePointId,
    appendExistingPointToActivePlanarPolygonGroup,
    upsertDirectDistanceRelation,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
    finishDistanceMeasurementSession,
    setDoubleClickChainSourcePointId,
    handleDefaultPointNodeClick,
  }: UseMeasurementNodeInteractionControllerParams
) => {
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
      if (selectionModeActive) {
        selectAnnotationIds([pointId], effectiveSelectModeAdditive);
        return;
      }

      const clickedMeasurement = annotations.find(
        (measurement) => measurement.id === pointId
      );
      const isAuxiliaryLabelAnchor = Boolean(
        clickedMeasurement?.auxiliaryLabelAnchor
      );
      const isPolylineAuthoringTool =
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType);

      if (
        activeToolType === ANNOTATION_TYPE_POINT ||
        activeToolType === ANNOTATION_TYPE_LABEL
      ) {
        selectAnnotationById(pointId);
        return;
      }

      if (
        (activeToolType === ANNOTATION_TYPE_DISTANCE ||
          isPolylineAuthoringTool) &&
        !selectablePointIds.has(pointId)
      ) {
        return;
      }

      if (isAuxiliaryLabelAnchor) {
        selectAnnotationById(pointId);
        return;
      }

      if (
        activeToolType === ANNOTATION_TYPE_DISTANCE ||
        isPolylineAuthoringTool
      ) {
        syncAnnotationCursorToExistingPoint(pointId);
      }

      if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
        const sourcePointId = resolveDistanceRelationSourcePointId(pointId);
        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, pointId);
          if (distanceModeStickyToFirstPoint) {
            setDoubleClickChainSourcePointId(sourcePointId);
            selectAnnotationById(pointId);
          } else {
            finishDistanceMeasurementSession(pointId);
          }
          return;
        }

        setDoubleClickChainSourcePointId(pointId);
        selectAnnotationById(pointId);
        return;
      }

      if (isPolylineAuthoringTool) {
        if (!isActiveDrawMode) {
          appendExistingPointToActivePlanarPolygonGroup(pointId, null);
          setDoubleClickChainSourcePointId(pointId);
          selectAnnotationById(pointId);
          return;
        }

        const activeOpenGroup = getActiveOpenPlanarGroup(
          planarPolygonGroups,
          activePlanarMeasurementId
        );
        const firstVertexId = activeOpenGroup?.vertexPointIds[0] ?? null;
        const shouldHandleRingClosure = Boolean(
          firstVertexId &&
            firstVertexId === pointId &&
            activeOpenGroup &&
            activeOpenGroup.vertexPointIds.length >= 3
        );
        if (shouldHandleRingClosure) {
          if (activeToolType !== ANNOTATION_TYPE_POLYLINE) {
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
        selectAnnotationById(pointId);
        return;
      }

      handleDefaultPointNodeClick(pointId);
    },
    [
      selectionModeActive,
      selectAnnotationIds,
      effectiveSelectModeAdditive,
      activeToolType,
      annotations,
      selectablePointIds,
      selectAnnotationById,
      syncAnnotationCursorToExistingPoint,
      resolveDistanceRelationSourcePointId,
      upsertDirectDistanceRelation,
      setDoubleClickChainSourcePointId,
      distanceModeStickyToFirstPoint,
      isActiveDrawMode,
      appendExistingPointToActivePlanarPolygonGroup,
      planarPolygonGroups,
      activePlanarMeasurementId,
      closeActivePlanarPolygonGroup,
      finishActivePlanarPolylineGroup,
      finishDistanceMeasurementSession,
      handleDefaultPointNodeClick,
    ]
  );

  return {
    interactivePointIds,
    handlePointNodeClick,
    handlePointNodeHoverChange,
  } as const;
};
