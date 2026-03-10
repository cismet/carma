import { useCallback, useEffect, useMemo } from "react";

import {
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
} from "@carma-mapping/annotations/core";

import type { AnnotationsManagementState } from "./useAnnotationsManagement";
import type { AnnotationsEditingState } from "./useAnnotationsEditing";
import { useMeasurementNodeInteractionController } from "./input/useMeasurementNodeInteractionController";
import { buildActivePointCreateConfig } from "./point/create/pointCreateConfig";
import { usePointQueryCreationController } from "./usePointQueryCreationController";

export const useAnnotationsUserInteraction = (
  managedAnnotations: AnnotationsManagementState,
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
    activePlanarMeasurementId,
    planarPolygonGroups,
    selectAnnotationIds,
    selectAnnotationById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    resolveDistanceRelationSourcePointId,
    appendExistingPointToActivePlanarPolygonGroup,
    upsertDirectDistanceRelation,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
    finishDistanceMeasurementSession,
    setDoubleClickChainSourcePointId,
    selectedAnnotationId,
    cyclePointLabelMetricModeByMeasurementId,
    labelInputPromptPointId,
    setLabelInputPromptPointId,
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
  } = useMeasurementNodeInteractionController(
    annotations,
    planarPolygonGroups,
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
      releaseAnnotationCursorSnap,
      scheduleAnnotationCursorSnapRelease,
      resolveDistanceRelationSourcePointId,
      appendExistingPointToActivePlanarPolygonGroup,
      upsertDirectDistanceRelation,
      closeActivePlanarPolygonGroup,
      finishActivePlanarPolylineGroup,
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
    handlePointLabelHoverChange,
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
    isPointMeasureCreateModeActive,
  };
};

export type AnnotationsUserInteractionState = ReturnType<
  typeof useAnnotationsUserInteraction
>;
