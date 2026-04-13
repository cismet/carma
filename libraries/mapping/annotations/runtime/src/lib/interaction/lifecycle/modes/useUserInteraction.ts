import { useCallback, useEffect, useMemo } from "react";

import {
  buildActivePointCreateConfig,
  type AnnotationEntry,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { Scene, Cartesian2, Cartesian3 } from "@carma-cesium";

import type { EditingState } from "../../editing/useEditing";
import { usePointQueryCreationController } from "../../point-query/usePointQueryCreationController";
import { useNodeInteractionController } from "./useNodeInteractionController";
type UserInteractionInput = {
  annotations: AnnotationCollection;
  activeToolType: AnnotationToolType;
  selectionModeActive: boolean;
  effectiveSelectModeAdditive: boolean;
  selectablePointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  isMoveGizmoDragging: boolean;
  pointQueryEnabled: boolean;
  hasCandidateNode: boolean;
  isActiveDrawMode: boolean;
  activeNodeChainAnnotationId: string | null;
  nodeChainAnnotations: NodeChainAnnotation[];
  selectAnnotationIds: (ids: string[], additive?: boolean) => void;
  selectAnnotationById: (id: string | null) => void;
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
  selectedAnnotationId: string | null;
  cyclePointLabelMetricModeByMeasurementId: (id: string) => void;
  labelInputPromptPointId: string | null;
  setLabelInputPromptPointId: (id: string | null) => void;
  setReferencePointId: (pointId: string) => void;
  pointTemporaryMode: boolean;
  pointVerticalOffsetMeters: number;
  lastCustomPointAnnotationName: string;
  isPolylineCandidateMode: boolean;
  polylineVerticalOffsetMeters: number;
  scene: Scene | null;
  setAnnotations: (
    next:
      | AnnotationCollection
      | ((prev: AnnotationCollection) => AnnotationCollection)
  ) => void;
  handlePointQueryPointCreated: (
    id: string,
    positionECEF: Cartesian3,
    annotationEntry?: AnnotationEntry
  ) => void;
  handlePointQueryDoubleClick: () => void;
  hasFocusedSelection: boolean;
  clearFocusedSelection: () => void;
  selectByPolygonGroupId: (groupId: string) => void;
  handleAnnotationCursorMove: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
};

export const useUserInteraction = (
  managedAnnotations: UserInteractionInput,
  annotationEditing: EditingState
) => {
  const {
    annotations,
    activeToolType,
    selectionModeActive,
    effectiveSelectModeAdditive,
    selectablePointIds,
    moveGizmoPointId,
    isMoveGizmoDragging,
    pointQueryEnabled,
    hasCandidateNode,
    isActiveDrawMode,
    activeNodeChainAnnotationId,
    nodeChainAnnotations,
    selectAnnotationIds,
    selectAnnotationById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    insertExistingNodeIntoActiveChain,
    finishesOnLoopClosure,
    requestFinishMeasurement,
    selectedAnnotationId,
    cyclePointLabelMetricModeByMeasurementId,
    labelInputPromptPointId,
    setLabelInputPromptPointId,
    setReferencePointId,
    pointTemporaryMode,
    pointVerticalOffsetMeters,
    lastCustomPointAnnotationName,
    isPolylineCandidateMode,
    polylineVerticalOffsetMeters,
    scene,
    setAnnotations,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    hasFocusedSelection,
    clearFocusedSelection,
    selectByPolygonGroupId,
    handleAnnotationCursorMove,
  } = managedAnnotations;
  const { requestUpdateEditTarget } = annotationEditing;
  const allowInteractiveNodeCursorSnap =
    pointQueryEnabled &&
    hasCandidateNode &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;
  const activePointCreateConfig = useMemo(
    () =>
      buildActivePointCreateConfig({
        activeToolType,
        temporaryMode: pointTemporaryMode,
        pointVerticalOffsetMeters,
        lastCustomPointAnnotationName,
        isPolylineCandidateMode,
        polylineVerticalOffsetMeters,
      }),
    [
      activeToolType,
      isPolylineCandidateMode,
      lastCustomPointAnnotationName,
      pointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
      pointTemporaryMode,
    ]
  );
  const activePointMode = activePointCreateConfig?.mode ?? null;
  const isPointMeasureLabelModeActive = activePointMode === "label-placement";
  const isPointMeasureLabelInputPending =
    isPointMeasureLabelModeActive && labelInputPromptPointId !== null;
  const isPointMeasureCreateModeActive = activePointMode === "point-measure";
  const pointQueryToolActive =
    !isPointMeasureLabelInputPending && activePointMode !== null;

  useEffect(
    function effectClearLabelPromptOutsidePointLabelMode() {
      if (activePointMode !== "label-placement") {
        setLabelInputPromptPointId(null);
      }
    },
    [activePointMode, setLabelInputPromptPointId]
  );

  useEffect(
    function effectClearMissingLabelPromptPoint() {
      if (!labelInputPromptPointId) {
        return;
      }

      const hasPromptAnnotation = annotations.some(
        (annotation) => annotation.id === labelInputPromptPointId
      );
      if (!hasPromptAnnotation) {
        setLabelInputPromptPointId(null);
      }
    },
    [annotations, labelInputPromptPointId, setLabelInputPromptPointId]
  );

  const {
    interactivePointIds,
    handlePointNodeClick,
    handlePointNodeHoverChange: handlePointLabelHoverChange,
  } = useNodeInteractionController(annotations, nodeChainAnnotations, {
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
    handleDefaultPointNodeClick: (id) => {
      if (selectedAnnotationId === id) {
        cyclePointLabelMetricModeByMeasurementId(id);
        return;
      }
      selectAnnotationById(id);
    },
  });

  const handlePointLabelClick = useCallback(
    (pointId: string) => {
      if (
        requestUpdateEditTarget({
          kind: "point-elevation-reference",
          pointId,
        })
      ) {
        return;
      }
      handlePointNodeClick(pointId);
    },
    [handlePointNodeClick, requestUpdateEditTarget]
  );

  const handlePointLabelDoubleClick = useCallback(
    (pointId: string) => {
      if (!selectablePointIds.has(pointId)) {
        return;
      }

      setReferencePointId(pointId);
      requestFinishMeasurement();
      selectAnnotationById(pointId);
    },
    [
      requestFinishMeasurement,
      selectAnnotationById,
      selectablePointIds,
      setReferencePointId,
    ]
  );

  usePointQueryCreationController(scene, activePointCreateConfig, {
    pointQueryToolActive,
    pointQueryEnabled,
    selectionModeActive,
    moveGizmoPointId,
    isMoveGizmoDragging,
    isActiveDrawMode,
    hasFocusedSelection,
    setAnnotations,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    clearFocusedSelection,
    selectByPolygonGroupId,
    handleAnnotationCursorMove,
  });

  return {
    interactivePointIds,
    handlePointLabelClick,
    handlePointLabelDoubleClick,
    handlePointLabelHoverChange,
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
    isPointMeasureCreateModeActive,
  };
};

export type UserInteractionState = ReturnType<typeof useUserInteraction>;
