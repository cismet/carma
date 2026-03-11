import { useMemo } from "react";

import {
  ANNOTATION_TYPE_POINT,
  type AnnotationCollection,
  type AnnotationToolType,
  type CandidateConnectionPreview,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
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
import { usePointCandidateDomOverlay } from "../interaction/candidate/usePointCandidateDomOverlay";
import { usePointCandidateRingIndicator } from "../interaction/candidate/usePointCandidateRingIndicator";
import {
  buildCandidatePreviewEdgeRenderModels,
  buildEdgeSceneLineRenderModels,
} from "./edge/buildEdgeSceneLineRenderModels";
import { useEdgeComponentOverlayVisualizer } from "./edge/overlay/useEdgeComponentOverlayVisualizer";
import { buildEdgeRelationRenderContext } from "./edge/buildEdgeRelationRenderContext";
import { useNodeChainPreviewModels } from "./useNodeChainPreviewModels";
import { usePointLabelVisualizer } from "./point/usePointLabelVisualizer";
import { usePolylineOverlayVisualizer } from "./polyline/usePolylineOverlayVisualizer";
import { useAnnotationCursorOverlay } from "../interaction/useAnnotationCursorOverlay";
import { useRectangleSelectionOverlay } from "../selection/useRectangleSelectionOverlay";
import type { AnnotationsEditingState } from "../interaction/editing/useAnnotationsEditing";
import type { AnnotationsUserInteractionState } from "../interaction/useAnnotationsUserInteraction";
import { usePointAnnotationIndex } from "./usePointAnnotationIndex";
import type { Cartesian3, Scene } from "@carma/cesium";
import type { AnnotationsOptions } from "../AnnotationsProvider";
import type { AnnotationPointMarkerBadge } from "./useAnnotationPointMarkerBadges";
import type { AnnotationSelectionState } from "../selection/annotationSelection.types";
import type { RectangleSelectionState } from "../selection/useRectangleSelectionOverlay";

const POINT_LABEL_LONG_PRESS_DURATION_MS = 300;

export const useAnnotationsVisualization = (
  managedAnnotations: {
    scene: Scene;
    visibleMeasurementsForRendering: AnnotationCollection;
    effectiveDistanceRelationsForRendering: PointDistanceRelation[];
    visiblePolygonAnnotationsForRendering: NodeChainAnnotation[];
    focusedNodeChainAnnotationId: string | null;
    activeNodeChainAnnotationId: string | null;
    cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
    showPoints: boolean;
    showPointLabels: boolean;
    effectiveReferenceElevation: number;
    occlusionChecksEnabled: boolean;
    options?: AnnotationsOptions;
    effectiveDistanceToReferenceByPointId: Readonly<Record<string, number>>;
    pointMarkerBadgeByPointId: Readonly<
      Record<string, AnnotationPointMarkerBadge>
    >;
    hiddenPointLabelIds: ReadonlySet<string>;
    effectiveFullyHiddenPointIds: ReadonlySet<string>;
    markerlessPointIds: ReadonlySet<string>;
    collapsedPillPointIds: ReadonlySet<string>;
    labelInputPromptPointId: string | null;
    moveGizmoPointId: string | null;
    moveGizmoOptions: Partial<{
      markerSizeScale: number;
      labelDistanceScale: number;
    }>;
    isMoveGizmoDragging: boolean;
    annotationCursorEnabled: boolean;
    activeCandidateNodeECEF: Cartesian3 | null;
    cursorScreenPosition: { x: number; y: number } | null;
    activeCandidateNodeSurfaceNormalECEF: Cartesian3 | null;
    activeCandidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
    activeToolType: AnnotationToolType;
    candidateConnectionPreview: CandidateConnectionPreview | null;
    candidatePreviewDistanceMeters: number | undefined;
    referencePoint: Cartesian3 | null;
    pointRadius: number;
    annotationSelection: AnnotationSelectionState;
    rectangleSelection: RectangleSelectionState;
  },
  annotationUserInteraction: AnnotationsUserInteractionState,
  annotationEditing: AnnotationsEditingState
) => {
  const {
    scene,
    visibleMeasurementsForRendering,
    effectiveDistanceRelationsForRendering,
    visiblePolygonAnnotationsForRendering,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
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
    annotationSelection,
    rectangleSelection,
  } = managedAnnotations;
  const {
    interactivePointIds,
    handlePointLabelClick,
    handlePointLabelDoubleClick,
    handlePointLabelHoverChange,
    isPointMeasureLabelModeActive,
    isPointMeasureLabelInputPending,
  } = annotationUserInteraction;
  const {
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
    requestStartEdit,
  } = annotationEditing;
  const selectedAnnotations = annotationSelection;
  const isPointMeasurementToolActive = activeToolType === ANNOTATION_TYPE_POINT;
  const showMeasurementGeometry = true;
  const showAnnotationLabels = true;

  const markerOnlyOverlayNodeInteractions =
    (annotationCursorEnabled && !isPointMeasureLabelModeActive) ||
    isPointMeasureLabelInputPending;
  const suppressCandidateLabelOverlay = isPointMeasureLabelModeActive;
  const { points, pointsById } = usePointAnnotationIndex(
    visibleMeasurementsForRendering
  );
  const viewProjector = useCesiumViewProjector(scene);
  const nodeChainPreviewModels = useNodeChainPreviewModels(
    visiblePolygonAnnotationsForRendering,
    {
      enabled: showMeasurementGeometry,
      pointsById,
      focusedNodeChainAnnotationId,
      activeNodeChainAnnotationId,
      pointMarkerBadgeByPointId,
      candidateConnectionPreview,
    }
  );
  const previewEdges = useMemo(
    () => [
      ...buildCandidatePreviewEdgeRenderModels({
        candidateConnection: candidateConnectionPreview,
      }),
      ...nodeChainPreviewModels.verticalPreviewEdges,
      ...nodeChainPreviewModels.polygonClosurePreviewEdges,
    ],
    [
      candidateConnectionPreview,
      nodeChainPreviewModels.polygonClosurePreviewEdges,
      nodeChainPreviewModels.verticalPreviewEdges,
    ]
  );

  const edgeRelationRenderContext = useMemo(
    () =>
      buildEdgeRelationRenderContext({
        nodeChainAnnotations: visiblePolygonAnnotationsForRendering,
        focusedNodeChainAnnotationId,
        activeNodeChainAnnotationId,
        pointsById,
      }),
    [
      activeNodeChainAnnotationId,
      focusedNodeChainAnnotationId,
      pointsById,
      visiblePolygonAnnotationsForRendering,
    ]
  );

  const edgeSceneLines = useMemo(
    () =>
      buildEdgeSceneLineRenderModels({
        pointsById,
        distanceRelations: showMeasurementGeometry
          ? effectiveDistanceRelationsForRendering
          : [],
        previewEdges: showMeasurementGeometry ? previewEdges : [],
      }),
    [
      effectiveDistanceRelationsForRendering,
      pointsById,
      previewEdges,
      showMeasurementGeometry,
    ]
  );

  useEdgeComponentOverlayVisualizer(scene, points, {
    distanceRelations: showMeasurementGeometry
      ? [...effectiveDistanceRelationsForRendering]
      : [],
    onDistanceLineLabelToggle: handleDistanceRelationLineLabelToggle,
    onDistanceLineClick: handleDistanceRelationLineClick,
    onDistanceRelationMidpointClick: handleDistanceRelationMidpointClick,
    onDistanceRelationCornerClick: handleDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    previewEdges: showMeasurementGeometry ? previewEdges : [],
    distanceRelationRenderContext: edgeRelationRenderContext,
    enabled: showMeasurementGeometry,
  });

  useCesiumEdgeVisualizer(scene, edgeSceneLines, {
    enabled: showMeasurementGeometry,
  });

  usePolylineOverlayVisualizer(
    scene,
    showMeasurementGeometry
      ? [...nodeChainPreviewModels.polylineMeasurements]
      : []
  );

  useGroundAreaLabelVisualizer(
    viewProjector,
    showAnnotationLabels
      ? [...nodeChainPreviewModels.groundPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId: nodeChainPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        nodeChainPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  useVerticalAreaLabelVisualizer(
    viewProjector,
    showAnnotationLabels
      ? [...nodeChainPreviewModels.verticalPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId: nodeChainPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        nodeChainPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  usePlanarAreaLabelVisualizer(
    viewProjector,
    showAnnotationLabels
      ? [...nodeChainPreviewModels.planarPolygonPreviewGroups]
      : [],
    {
      focusedPolygonGroupId: nodeChainPreviewModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId:
        nodeChainPreviewModels.polygonAreaBadgeByGroupId,
    }
  );

  useCesiumGroundPolygonPrimitives(
    scene,
    showMeasurementGeometry
      ? nodeChainPreviewModels.groundPolygonPrimitives
      : []
  );
  useCesiumCoplanarPolygonPrimitives(
    scene,
    showMeasurementGeometry
      ? nodeChainPreviewModels.verticalPolygonPrimitives
      : []
  );
  useCesiumCoplanarPolygonPrimitives(
    scene,
    showMeasurementGeometry
      ? nodeChainPreviewModels.planarPolygonPrimitives
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

  useAnnotationCursorOverlay(
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
      showLabels: showAnnotationLabels && showPointLabels,
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
