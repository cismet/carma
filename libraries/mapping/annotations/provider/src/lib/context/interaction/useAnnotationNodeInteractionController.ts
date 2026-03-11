import { useCallback, useMemo } from "react";

import {
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  isAreaToolType,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";

const EMPTY_INTERACTIVE_POINT_ID_SET = new Set<string>();

type UseAnnotationNodeInteractionControllerParams = {
  activeToolType: AnnotationToolType;
  allowInteractiveNodeCursorSnap: boolean;
  selectionModeActive: boolean;
  effectiveSelectModeAdditive: boolean;
  selectablePointIds: ReadonlySet<string>;
  isActiveDrawMode: boolean;
  distanceModeStickyToFirstPoint: boolean;
  activeNodeChainAnnotationId: string | null;
  selectAnnotationIds: (ids: string[], additive?: boolean) => void;
  selectAnnotationById: (id: string) => void;
  syncAnnotationCursorToExistingPoint: (
    pointId: string,
    anchorPosition?: { x: number; y: number } | null
  ) => boolean;
  releaseAnnotationCursorSnap: () => void;
  scheduleAnnotationCursorSnapRelease: (pointId: string) => void;
  resolveDistanceRelationSourcePointId: (
    targetPointId: string
  ) => string | null;
  insertExistingNodeIntoActiveChain: (
    existingPointId: string,
    sourcePointId?: string | null
  ) => boolean | void;
  upsertDirectDistanceRelation: (
    sourcePointId: string,
    targetPointId: string
  ) => void;
  closeActivePolygonAnnotation: () => void;
  finishActivePolylineAnnotation: () => void;
  finishDistanceMeasurementSession: (selectedPointId: string | null) => void;
  setDoubleClickChainSourcePointId: (pointId: string | null) => void;
  handleDefaultPointNodeClick: (pointId: string) => void;
};

const getActiveOpenNodeChainAnnotation = (
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  activeNodeChainAnnotationId: string | null
) =>
  activeNodeChainAnnotationId !== null
    ? nodeChainAnnotations.find(
        (group) => group.id === activeNodeChainAnnotationId && !group.closed
      ) ?? null
    : null;

export const useAnnotationNodeInteractionController = (
  annotations: AnnotationCollection,
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  {
    activeToolType,
    allowInteractiveNodeCursorSnap,
    selectionModeActive,
    effectiveSelectModeAdditive,
    selectablePointIds,
    isActiveDrawMode,
    distanceModeStickyToFirstPoint,
    activeNodeChainAnnotationId,
    selectAnnotationIds,
    selectAnnotationById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    resolveDistanceRelationSourcePointId,
    insertExistingNodeIntoActiveChain,
    upsertDirectDistanceRelation,
    closeActivePolygonAnnotation,
    finishActivePolylineAnnotation,
    finishDistanceMeasurementSession,
    setDoubleClickChainSourcePointId,
    handleDefaultPointNodeClick,
  }: UseAnnotationNodeInteractionControllerParams
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
      const isNodeChainAuthoringTool =
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
          isNodeChainAuthoringTool) &&
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
        isNodeChainAuthoringTool
      ) {
        syncAnnotationCursorToExistingPoint(pointId);
      }

      if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
        const sourcePointId = resolveDistanceRelationSourcePointId(pointId);
        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, pointId);
          if (distanceModeStickyToFirstPoint) {
            setDoubleClickChainSourcePointId(sourcePointId);
          } else {
            finishDistanceMeasurementSession(null);
          }
          releaseAnnotationCursorSnap();
          return;
        }

        setDoubleClickChainSourcePointId(pointId);
        releaseAnnotationCursorSnap();
        return;
      }

      if (isNodeChainAuthoringTool) {
        if (!isActiveDrawMode) {
          const didStartNodeChain = Boolean(
            insertExistingNodeIntoActiveChain(pointId, null)
          );
          if (!didStartNodeChain) {
            return;
          }
          setDoubleClickChainSourcePointId(pointId);
          releaseAnnotationCursorSnap();
          return;
        }

        const activeOpenGroup = getActiveOpenNodeChainAnnotation(
          nodeChainAnnotations,
          activeNodeChainAnnotationId
        );
        const firstNodeId = activeOpenGroup?.nodeIds[0] ?? null;
        const shouldHandleRingClosure = Boolean(
          firstNodeId &&
            firstNodeId === pointId &&
            activeOpenGroup &&
            activeOpenGroup.nodeIds.length >= 3
        );
        if (shouldHandleRingClosure) {
          if (activeToolType !== ANNOTATION_TYPE_POLYLINE) {
            closeActivePolygonAnnotation();
          } else {
            finishActivePolylineAnnotation();
          }
          return;
        }

        const sourcePointId = resolveDistanceRelationSourcePointId(pointId);
        const didAppendExistingPoint = Boolean(
          insertExistingNodeIntoActiveChain(pointId, sourcePointId)
        );
        if (didAppendExistingPoint) {
          setDoubleClickChainSourcePointId(pointId);
          releaseAnnotationCursorSnap();
          return;
        }

        if (sourcePointId) {
          upsertDirectDistanceRelation(sourcePointId, pointId);
        }

        setDoubleClickChainSourcePointId(pointId);
        releaseAnnotationCursorSnap();
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
      releaseAnnotationCursorSnap,
      resolveDistanceRelationSourcePointId,
      upsertDirectDistanceRelation,
      setDoubleClickChainSourcePointId,
      distanceModeStickyToFirstPoint,
      isActiveDrawMode,
      insertExistingNodeIntoActiveChain,
      nodeChainAnnotations,
      activeNodeChainAnnotationId,
      closeActivePolygonAnnotation,
      finishActivePolylineAnnotation,
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
