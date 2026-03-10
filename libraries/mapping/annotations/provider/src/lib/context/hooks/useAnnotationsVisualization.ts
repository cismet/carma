import { useMemo } from "react";

import { ANNOTATION_TYPE_POINT } from "@carma-mapping/annotations/core";
import {
  useCesiumCoplanarPolygonPrimitives,
  useCesiumEdgeVisualizer,
  useCesiumGroundPolygonPrimitives,
  useCesiumViewProjector,
} from "@carma-mapping/annotations/cesium";

import {
  useGroundAreaLabelVisualizer,
  usePlanarAreaLabelVisualizer,
  useVerticalAreaLabelVisualizer,
} from "./area/labels";
import { usePointCandidateDomOverlay } from "./candidate/usePointCandidateDomOverlay";
import { usePointCandidateRingIndicator } from "./candidate/usePointCandidateRingIndicator";
import {
  buildCandidatePreviewEdgeRenderModels,
  buildEdgeSceneLineRenderModels,
} from "./edge/buildEdgeSceneLineRenderModels";
import { useEdgeComponentOverlayVisualizer } from "./edge/overlay/useEdgeComponentOverlayVisualizer";
import { buildEdgeRelationRenderContext } from "./edge/useEdgeRelationRenderContext";
import { usePlanarMeasurementPreviewModels } from "./planar/usePlanarMeasurementPreviewModels";
import { usePointLabelVisualizer } from "./point/usePointLabelVisualizer";
import { usePolylineOverlayVisualizer } from "./polyline/usePolylineOverlayVisualizer";
import { useMeasurementCursorOverlay } from "./preview/useMeasurementCursorOverlay";
import { useRectangleSelectionOverlay } from "./selection/useRectangleSelectionOverlay";
import type { AnnotationsEditingState } from "./useAnnotationsEditing";
import type { AnnotationsManagementState } from "./useAnnotationsManagement";
import type { AnnotationsUserInteractionState } from "./useAnnotationsUserInteraction";
import { usePointAnnotationIndex } from "./usePointAnnotationIndex";

const POINT_LABEL_LONG_PRESS_DURATION_MS = 300;

export const useAnnotationsVisualization = (
  managedAnnotations: AnnotationsManagementState,
  annotationUserInteraction: AnnotationsUserInteractionState,
  annotationEditing: AnnotationsEditingState
) => {
  const {
    scene,
    visibleMeasurementsForRendering,
    effectiveDistanceRelationsForRendering,
    visiblePlanarPolygonGroupsForRendering,
    focusedPlanarMeasurementId,
    activePlanarMeasurementId,
    cumulativeDistanceByRelationId,
    showPoints,
    showPointLabels,
    effectiveReferenceElevation,
    occlusionChecksEnabled,
    options,
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
    markerlessPointIds,
    collapsedPillPointIds,
    labelInputPromptPointId,
    moveGizmoPointId,
    moveGizmoOptions,
    isMoveGizmoDragging,
    handlePointLabelDoubleClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationLineClick,
    handleDistanceRelationMidpointClick,
    handleDistanceRelationCornerClick,
    annotationCursorEnabled,
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    activeToolType,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
    referencePoint,
    pointRadius,
    showDistanceAndPolygonVisuals,
    annotationSelection,
    rectangleSelection,
  } = managedAnnotations;
  const {
    interactivePointIds,
    handlePointLabelClick,
    handlePointLabelHoverChange,
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
  } = annotationUserInteraction;
  const { requestStartEdit } = annotationEditing;
  const selectedAnnotations = annotationSelection;
  const isPointMeasurementToolActive = activeToolType === ANNOTATION_TYPE_POINT;

  const markerOnlyOverlayNodeInteractions =
    (annotationCursorEnabled && !isPointMeasureLabelModeActive) ||
    isPointMeasureLabelInputPending;
  const suppressCandidateLabelOverlay = isPointMeasureLabelModeActive;
  const { points, pointsById } = usePointAnnotationIndex(
    visibleMeasurementsForRendering
  );
  const viewProjector = useCesiumViewProjector(scene);
  const planarMeasurementPreviewModels = usePlanarMeasurementPreviewModels(
    visiblePlanarPolygonGroupsForRendering,
    {
      enabled: showDistanceAndPolygonVisuals,
      pointsById,
      focusedPlanarMeasurementId,
      activePlanarMeasurementId,
      pointMarkerBadgeByPointId,
      candidateConnectionPreview,
    }
  );
  const previewEdges = useMemo(
    () => [
      ...buildCandidatePreviewEdgeRenderModels({
        candidateConnection: candidateConnectionPreview,
      }),
      ...planarMeasurementPreviewModels.verticalPreviewEdges,
      ...planarMeasurementPreviewModels.polygonClosurePreviewEdges,
    ],
    [
      candidateConnectionPreview,
      planarMeasurementPreviewModels.polygonClosurePreviewEdges,
      planarMeasurementPreviewModels.verticalPreviewEdges,
    ]
  );

  const edgeRelationRenderContext = useMemo(
    () =>
      buildEdgeRelationRenderContext({
        planarPolygonGroups: visiblePlanarPolygonGroupsForRendering,
        focusedPlanarMeasurementId,
        activePlanarMeasurementId,
        pointsById,
      }),
    [
      activePlanarMeasurementId,
      focusedPlanarMeasurementId,
      pointsById,
      visiblePlanarPolygonGroupsForRendering,
    ]
  );

  const edgeSceneLines = useMemo(
    () =>
      buildEdgeSceneLineRenderModels({
        pointsById,
        distanceRelations: showDistanceAndPolygonVisuals
          ? effectiveDistanceRelationsForRendering
          : [],
        previewEdges: showDistanceAndPolygonVisuals ? previewEdges : [],
      }),
    [
      effectiveDistanceRelationsForRendering,
      pointsById,
      previewEdges,
      showDistanceAndPolygonVisuals,
    ]
  );

  useEdgeComponentOverlayVisualizer(scene, points, {
    distanceRelations: showDistanceAndPolygonVisuals
      ? [...effectiveDistanceRelationsForRendering]
      : [],
    onDistanceLineLabelToggle: handleDistanceRelationLineLabelToggle,
    onDistanceLineClick: handleDistanceRelationLineClick,
    onDistanceRelationMidpointClick: handleDistanceRelationMidpointClick,
    onDistanceRelationCornerClick: handleDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    previewEdges: showDistanceAndPolygonVisuals ? previewEdges : [],
    distanceRelationRenderContext: edgeRelationRenderContext,
    enabled: showDistanceAndPolygonVisuals,
  });

  useCesiumEdgeVisualizer(scene, edgeSceneLines, {
    enabled: showDistanceAndPolygonVisuals,
  });

  usePolylineOverlayVisualizer(
    scene,
    showDistanceAndPolygonVisuals
      ? [...planarMeasurementPreviewModels.polylineMeasurements]
      : []
  );

  useGroundAreaLabelVisualizer(
    viewProjector,
    showDistanceAndPolygonVisuals
      ? [...planarMeasurementPreviewModels.groundPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId:
        planarMeasurementPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        planarMeasurementPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  useVerticalAreaLabelVisualizer(
    viewProjector,
    showDistanceAndPolygonVisuals
      ? [...planarMeasurementPreviewModels.verticalPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId:
        planarMeasurementPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        planarMeasurementPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  usePlanarAreaLabelVisualizer(
    viewProjector,
    showDistanceAndPolygonVisuals
      ? [...planarMeasurementPreviewModels.planarPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId:
        planarMeasurementPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        planarMeasurementPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  useCesiumGroundPolygonPrimitives(
    scene,
    showDistanceAndPolygonVisuals
      ? planarMeasurementPreviewModels.groundPolygonPrimitives
      : []
  );
  useCesiumCoplanarPolygonPrimitives(
    scene,
    showDistanceAndPolygonVisuals
      ? planarMeasurementPreviewModels.verticalPolygonPrimitives
      : []
  );
  useCesiumCoplanarPolygonPrimitives(
    scene,
    showDistanceAndPolygonVisuals
      ? planarMeasurementPreviewModels.planarPolygonPrimitives
      : []
  );

  usePointCandidateRingIndicator(
    scene,
    {
      pointECEF: annotationCursorEnabled ? activeCandidateNodeECEF : null,
      surfaceNormalECEF: annotationCursorEnabled
        ? activeCandidateNodeSurfaceNormalECEF
        : null,
      verticalOffsetAnchorECEF:
        annotationCursorEnabled && isPointMeasurementToolActive
          ? activeCandidateNodeVerticalOffsetAnchorECEF
          : null,
    },
    {
      radius: pointRadius,
    }
  );

  useMeasurementCursorOverlay(
    annotationCursorEnabled ? cursorScreenPosition : null,
    {
      enabled:
        showPoints &&
        annotationCursorEnabled &&
        Boolean(activeCandidateNodeECEF) &&
        !(
          annotationCursorEnabled &&
          isPointMeasurementToolActive &&
          activeCandidateNodeVerticalOffsetAnchorECEF
        ),
    }
  );

  const pointLabelData = usePointLabelVisualizer(scene, [...points], {
    display: {
      enabled: showPoints,
      showLabels: showPointLabels,
      referenceElevation: effectiveReferenceElevation,
      occlusionChecksEnabled,
      labelLayoutConfig: options?.labels,
      distanceToReferenceByPointId: effectiveDistanceToReferenceByPointId,
      hiddenPointLabelIds,
      fullyHiddenPointIds: effectiveFullyHiddenPointIds,
      markerlessPointIds,
      pillMarkerPointIds: collapsedPillPointIds,
      pointMarkerBadgeByPointId,
      labelInputPromptPointId,
      markerOnlyOverlayNodeInteractions,
      interactivePointIds,
    },
    selection: selectedAnnotations,
    editing: {
      editingPointId: moveGizmoPointId,
      editingPointIsDragging: isMoveGizmoDragging,
      editingPointMarkerSizeScale: moveGizmoOptions.markerSizeScale ?? 1,
      editingPointLabelDistanceScale: moveGizmoOptions.labelDistanceScale ?? 1,
    },
    interactions: {
      onPointClick: handlePointLabelClick,
      onPointDoubleClick: handlePointLabelDoubleClick,
      onPointLongPress: (pointId) =>
        requestStartEdit({ kind: "point-label", pointId }),
      onPointHoverChange: handlePointLabelHoverChange,
      onPointVerticalOffsetStemLongPress: (pointId) =>
        requestStartEdit({ kind: "point-vertical-offset-stem", pointId }),
      pointLongPressDurationMs: POINT_LABEL_LONG_PRESS_DURATION_MS,
    },
  });

  useRectangleSelectionOverlay(scene, pointLabelData, rectangleSelection);

  usePointCandidateDomOverlay(
    scene,
    {
      pointECEF: annotationCursorEnabled ? activeCandidateNodeECEF : null,
      verticalOffsetAnchorECEF:
        annotationCursorEnabled && isPointMeasurementToolActive
          ? activeCandidateNodeVerticalOffsetAnchorECEF
          : null,
      previewDistanceMeters: candidatePreviewDistanceMeters,
      referenceElevation: effectiveReferenceElevation,
      hasReferenceElevation: Boolean(referencePoint),
      suppressLabelOverlay: suppressCandidateLabelOverlay,
    },
    {
      labelLayoutConfig: options?.labels,
    }
  );
};
