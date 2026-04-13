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
  activeNodeChainAnnotationId: string | null;
  selectAnnotationIds: (ids: string[], additive?: boolean) => void;
  selectAnnotationById: (id: string) => void;
  syncAnnotationCursorToExistingPoint: (
    pointId: string,
    anchorPosition?: { x: number; y: number } | null
  ) => boolean;
  releaseAnnotationCursorSnap: () => void;
  scheduleAnnotationCursorSnapRelease: (pointId: string) => void;
  insertExistingNodeIntoActiveChain: (
    existingPointId: string,
    sourcePointId?: string | null
  ) => boolean | void;
  finishesOnLoopClosure: boolean;
  requestFinishMeasurement: () => boolean;
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

export const useNodeInteractionController = (
  annotations: AnnotationCollection,
  nodeChainAnnotations: readonly NodeChainAnnotation[],
  {
    activeToolType,
    allowInteractiveNodeCursorSnap,
    selectionModeActive,
    effectiveSelectModeAdditive,
    selectablePointIds,
    isActiveDrawMode,
    activeNodeChainAnnotationId,
    selectAnnotationIds,
    selectAnnotationById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    insertExistingNodeIntoActiveChain,
    finishesOnLoopClosure,
    requestFinishMeasurement,
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
      const isOpenLineAuthoringTool =
        activeToolType === ANNOTATION_TYPE_DISTANCE ||
        activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType);

      if (
        activeToolType === ANNOTATION_TYPE_POINT ||
        activeToolType === ANNOTATION_TYPE_LABEL
      ) {
        selectAnnotationById(pointId);
        return;
      }

      if (isOpenLineAuthoringTool && !selectablePointIds.has(pointId)) {
        return;
      }

      if (isAuxiliaryLabelAnchor) {
        selectAnnotationById(pointId);
        return;
      }

      if (isOpenLineAuthoringTool) {
        syncAnnotationCursorToExistingPoint(pointId);
      }

      if (isOpenLineAuthoringTool) {
        if (!isActiveDrawMode) {
          const didStartNodeChain = Boolean(
            insertExistingNodeIntoActiveChain(pointId, null)
          );
          if (!didStartNodeChain) {
            return;
          }
          releaseAnnotationCursorSnap();
          return;
        }

        const activeOpenGroup = getActiveOpenNodeChainAnnotation(
          nodeChainAnnotations,
          activeNodeChainAnnotationId
        );
        const sourcePointId =
          activeOpenGroup?.nodeIds[activeOpenGroup.nodeIds.length - 1] ?? null;
        const firstNodeId = activeOpenGroup?.nodeIds[0] ?? null;
        const shouldHandleRingClosure = Boolean(
          finishesOnLoopClosure &&
            firstNodeId &&
            firstNodeId === pointId &&
            activeOpenGroup &&
            activeOpenGroup.nodeIds.length >= 3
        );
        if (shouldHandleRingClosure) {
          requestFinishMeasurement();
          return;
        }

        const didAppendExistingPoint = Boolean(
          insertExistingNodeIntoActiveChain(pointId, sourcePointId)
        );
        if (didAppendExistingPoint) {
          releaseAnnotationCursorSnap();
          return;
        }
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
      isActiveDrawMode,
      insertExistingNodeIntoActiveChain,
      nodeChainAnnotations,
      activeNodeChainAnnotationId,
      finishesOnLoopClosure,
      requestFinishMeasurement,
      handleDefaultPointNodeClick,
    ]
  );

  return {
    interactivePointIds,
    handlePointNodeClick,
    handlePointNodeHoverChange,
  } as const;
};
