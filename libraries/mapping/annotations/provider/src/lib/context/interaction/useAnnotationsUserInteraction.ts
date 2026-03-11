import { useCallback, useEffect, useMemo } from "react";

import {
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
  type AnnotationEntry,
  type AnnotationCollection,
  type AnnotationToolType,
  type NodeChainAnnotation,
} from "@carma-mapping/annotations/core";
import type { Scene, Cartesian2, Cartesian3 } from "@carma/cesium";

import type { AnnotationsEditingState } from "./editing/useAnnotationsEditing";
import { useAnnotationNodeInteractionController } from "./useAnnotationNodeInteractionController";
import { buildActivePointCreateConfig } from "./pointCreateConfig";
import { usePointQueryCreationController } from "./usePointQueryCreationController";

type AnnotationsUserInteractionInput = {
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
  distanceModeStickyToFirstPoint: boolean;
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
  handlePointQueryBeforePointCreate: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2
  ) => boolean;
  handleAnnotationCursorMove: (
    positionECEF: Cartesian3 | null,
    screenPosition: Cartesian2,
    surfaceNormalECEF?: Cartesian3 | null
  ) => void;
};

export const useAnnotationsUserInteraction = (
  managedAnnotations: AnnotationsUserInteractionInput,
  annotationEditing: AnnotationsEditingState
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
    distanceModeStickyToFirstPoint,
    activeNodeChainAnnotationId,
    nodeChainAnnotations,
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
    handlePointQueryBeforePointCreate,
    handleAnnotationCursorMove,
  } = managedAnnotations;
  const { requestUpdateEditTarget } = annotationEditing;
  const allowInteractiveNodeCursorSnap =
    pointQueryEnabled &&
    hasCandidateNode &&
    !moveGizmoPointId &&
    !isMoveGizmoDragging;
  const isPointMeasureLabelModeActive =
    activeToolType === ANNOTATION_TYPE_LABEL;
  const isPointMeasureLabelInputPending =
    isPointMeasureLabelModeActive && labelInputPromptPointId !== null;
  const isPointMeasureCreateModeActive =
    activeToolType === ANNOTATION_TYPE_POINT;
  const pointQueryToolActive =
    !isPointMeasureLabelInputPending && activeToolType !== SELECT_TOOL_TYPE;
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

  useEffect(
    function effectClearLabelPromptOutsidePointLabelMode() {
      if (activeToolType !== ANNOTATION_TYPE_LABEL) {
        setLabelInputPromptPointId(null);
      }
    },
    [activeToolType, setLabelInputPromptPointId]
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
  } = useAnnotationNodeInteractionController(
    annotations,
    nodeChainAnnotations,
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
      handleDefaultPointNodeClick: (id) => {
        if (selectedAnnotationId === id) {
          cyclePointLabelMetricModeByMeasurementId(id);
          return;
        }
        selectAnnotationById(id);
      },
    }
  );

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
      finishDistanceMeasurementSession(pointId);
    },
    [finishDistanceMeasurementSession, selectablePointIds, setReferencePointId]
  );

  usePointQueryCreationController(
    scene,
    activeToolType,
    activePointCreateConfig,
    {
      pointQueryToolActive,
      pointQueryEnabled,
      selectionModeActive,
      moveGizmoPointId,
      isMoveGizmoDragging,
      setAnnotations,
      handlePointQueryPointCreated,
      handlePointQueryDoubleClick,
      handlePointQueryBeforePointCreate,
      handleAnnotationCursorMove,
    }
  );

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

export type AnnotationsUserInteractionState = ReturnType<
  typeof useAnnotationsUserInteraction
>;
