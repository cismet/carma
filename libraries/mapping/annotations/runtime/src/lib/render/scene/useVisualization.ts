import {
  ANNOTATION_TYPE_POINT,
  type PointAnnotationEntry,
  type AnnotationToolType,
  type CandidateConnectionPreview,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
import { useCesiumEdgeVisualizer } from "@carma-mapping/annotations/cesium";

import {
  useGroundAreaLabelVisualizer,
  usePlanarAreaLabelVisualizer,
  useVerticalAreaLabelVisualizer,
} from "../labels";
import {
  useCoplanarPolygonFillVisualizer,
  useGroundPolygonFillVisualizer,
} from "../fill";
import { usePointCandidateDomOverlay } from "../../interaction/candidate/usePointCandidateDomOverlay";
import { usePointCandidateRingIndicator } from "../../interaction/candidate/usePointCandidateRingIndicator";
import { useEdgeComponentOverlayVisualizer } from "../edge/overlay/useEdgeComponentOverlayVisualizer";
import { usePointLabelVisualizer } from "../labels/usePointLabelVisualizer";
import { usePolylineOverlayVisualizer } from "../edge/overlay/usePolylineOverlayVisualizer";
import { useCursorOverlay } from "../../interaction/cursor/useCursorOverlay";
import { useRectangleSelectionOverlay } from "../../selection/hooks/useRectangleSelectionOverlay";
import { useSceneModels } from "./useSceneModels";
import type { EditingState } from "../../interaction/editing/useEditing";
import type { UserInteractionState } from "../../interaction/lifecycle/modes/useUserInteraction";
import type { Cartesian3, Scene } from "@carma/cesium";
import type { AnnotationsOptions } from "../../config/annotationsOptions";
import type { AnnotationPointMarkerBadge } from "../point/usePointMarkerBadges";
import type { AnnotationSelectionState } from "../../selection/types/annotationSelection.types";
import type { RectangleSelectionState } from "../../selection/hooks/useRectangleSelectionOverlay";

const POINT_LABEL_LONG_PRESS_DURATION_MS = 300;

type VisualizationMoveGizmoOptions = Partial<{
  markerSizeScale: number;
  labelDistanceScale: number;
}>;

type VisualizationSceneParams = {
  scene: Scene;
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
};

type VisualizationGeometryParams = {
  effectiveDistanceRelationsForRendering: PointDistanceRelation[];
  visiblePolygonAnnotationsForRendering: NodeChainAnnotation[];
  cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
  visiblePointEntries: PointAnnotationEntry[];
  candidateConnectionPreview: CandidateConnectionPreview | null;
};

type VisualizationDisplayParams = {
  showPoints: boolean;
  showPointLabels: boolean;
  effectiveReferenceElevation: number;
  occlusionChecksEnabled: boolean;
  options?: AnnotationsOptions;
  referencePoint: Cartesian3 | null;
  pointRadius: number;
};

type VisualizationPointLabelParams = {
  effectiveDistanceToReferenceByPointId: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  polylinePointLabelTextByPointId: Readonly<Record<string, string>>;
  hiddenPointLabelIds: ReadonlySet<string>;
  effectiveFullyHiddenPointIds: ReadonlySet<string>;
  markerlessPointIds: ReadonlySet<string>;
  collapsedPillPointIds: ReadonlySet<string>;
  labelInputPromptPointId: string | null;
};

type VisualizationEditingParams = {
  moveGizmoPointId: string | null;
  moveGizmoOptions: VisualizationMoveGizmoOptions;
  isMoveGizmoDragging: boolean;
};

type VisualizationCandidateParams = {
  annotationCursorEnabled: boolean;
  activeCandidateNodeECEF: Cartesian3 | null;
  cursorScreenPosition: { x: number; y: number } | null;
  activeCandidateNodeSurfaceNormalECEF: Cartesian3 | null;
  activeCandidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
  activeToolType: AnnotationToolType;
  candidatePreviewDistanceMeters: number | undefined;
};

type VisualizationSelectionParams = {
  annotationSelection: AnnotationSelectionState;
  rectangleSelection: RectangleSelectionState;
};

type UseVisualizationParams = {
  scene: VisualizationSceneParams;
  geometry: VisualizationGeometryParams;
  display: VisualizationDisplayParams;
  pointLabels: VisualizationPointLabelParams;
  editing: VisualizationEditingParams;
  candidate: VisualizationCandidateParams;
  selection: VisualizationSelectionParams;
};

export const useVisualization = (
  {
    scene: sceneParams,
    geometry,
    display,
    pointLabels,
    editing,
    candidate,
    selection,
  }: UseVisualizationParams,
  annotationUserInteraction: UserInteractionState,
  annotationEditing: EditingState
) => {
  const { scene, focusedNodeChainAnnotationId, activeNodeChainAnnotationId } =
    sceneParams;
  const {
    effectiveDistanceRelationsForRendering,
    visiblePolygonAnnotationsForRendering,
    cumulativeDistanceByRelationId,
    visiblePointEntries,
    candidateConnectionPreview,
  } = geometry;
  const {
    showPoints,
    showPointLabels,
    effectiveReferenceElevation,
    occlusionChecksEnabled,
    options,
    referencePoint,
    pointRadius,
  } = display;
  const {
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    polylinePointLabelTextByPointId,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
    markerlessPointIds,
    collapsedPillPointIds,
    labelInputPromptPointId,
  } = pointLabels;
  const { moveGizmoPointId, moveGizmoOptions, isMoveGizmoDragging } = editing;
  const {
    annotationCursorEnabled,
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    activeToolType,
    candidatePreviewDistanceMeters,
  } = candidate;
  const { annotationSelection, rectangleSelection } = selection;
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
  const sceneModels = useSceneModels({
    scene,
    visiblePointEntries,
    visiblePolygonAnnotationsForRendering,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    candidateConnectionPreview,
    effectiveDistanceRelationsForRendering,
    showMeasurementGeometry,
  });

  useEdgeComponentOverlayVisualizer(scene, sceneModels.points, {
    distanceRelations: sceneModels.distanceRelations,
    onDistanceLineLabelToggle: handleDistanceRelationLineLabelToggle,
    onDistanceLineClick: handleDistanceRelationLineClick,
    onDistanceRelationMidpointClick: handleDistanceRelationMidpointClick,
    onDistanceRelationCornerClick: handleDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    previewEdges: sceneModels.previewEdges,
    distanceRelationRenderContext: sceneModels.edgeRelationRenderContext,
    enabled: showMeasurementGeometry,
  });

  useCesiumEdgeVisualizer(scene, sceneModels.edgeSceneLines, {
    enabled: showMeasurementGeometry,
  });

  usePolylineOverlayVisualizer(scene, sceneModels.polylineMeasurements);

  useGroundAreaLabelVisualizer(
    sceneModels.viewProjector,
    showAnnotationLabels ? [...sceneModels.groundPolygonPreviewGroups] : [],
    {
      focusedPolygonGroupId: sceneModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId: sceneModels.polygonAreaBadgeByGroupId,
    }
  );

  useVerticalAreaLabelVisualizer(
    sceneModels.viewProjector,
    showAnnotationLabels ? [...sceneModels.verticalPolygonPreviewGroups] : [],
    {
      focusedPolygonGroupId: sceneModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId: sceneModels.polygonAreaBadgeByGroupId,
    }
  );

  usePlanarAreaLabelVisualizer(
    sceneModels.viewProjector,
    showAnnotationLabels ? [...sceneModels.planarPolygonPreviewGroups] : [],
    {
      focusedPolygonGroupId: sceneModels.focusedPolygonGroupId,
      polygonAreaBadgeByGroupId: sceneModels.polygonAreaBadgeByGroupId,
    }
  );

  useGroundPolygonFillVisualizer(scene, sceneModels.groundPolygonPrimitives);
  useCoplanarPolygonFillVisualizer(scene, {
    verticalPolygonPrimitives: sceneModels.verticalPolygonPrimitives,
    planarPolygonPrimitives: sceneModels.planarPolygonPrimitives,
  });

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

  useCursorOverlay(annotationCursorEnabled ? cursorScreenPosition : null, {
    enabled:
      showPoints &&
      annotationCursorEnabled &&
      Boolean(activeCandidateNodeECEF) &&
      !(
        annotationCursorEnabled &&
        isPointMeasurementToolActive &&
        activeCandidateNodeVerticalOffsetAnchorECEF
      ),
  });

  const pointLabelData = usePointLabelVisualizer(
    scene,
    [...sceneModels.points],
    {
      display: {
        enabled: showPoints,
        showLabels: showAnnotationLabels && showPointLabels,
        referenceElevation: effectiveReferenceElevation,
        occlusionChecksEnabled,
        labelLayoutConfig: options?.labels,
        distanceToReferenceByPointId: effectiveDistanceToReferenceByPointId,
        polylinePointLabelTextByPointId,
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
        editingPointLabelDistanceScale:
          moveGizmoOptions.labelDistanceScale ?? 1,
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
    }
  );

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
