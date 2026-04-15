import {
  type PointAnnotationEntry,
  type NodeChainAnnotation,
  type PointDistanceRelation,
} from "@carma-mapping/annotations/core";
import { useCesiumEdgeVisualizer } from "@carma-mapping/engines/cesium/react/primitives";
import type { Scene } from "@carma-cesium";

import { useEdgeComponentOverlayVisualizer } from "../edge/overlay/use-edge-component-overlay-visualizer";
import { usePolylineOverlayVisualizer } from "../edge/overlay/use-polyline-overlay-visualizer";
import {
  useCoplanarPolygonFillVisualizer,
  useGroundPolygonFillVisualizer,
} from "../fill";
import {
  useGroundAreaLabelVisualizer,
  usePlanarAreaLabelVisualizer,
  useVerticalAreaLabelVisualizer,
} from "../labels";
import { usePointLabelVisualizer } from "../labels/use-point-label-visualizer";
import type { AnnotationPointMarkerBadge } from "../point/use-point-marker-badges";
import type { AnnotationsOptions } from "../../config/annotations-options";
import type { EditingState } from "../../interaction/editing/use-editing";
import type { UserInteractionState } from "../../interaction/lifecycle/modes/use-user-interaction";
import { useRectangleSelectionOverlay } from "../../selection/hooks/use-rectangle-selection-overlay";
import type { RectangleSelectionState } from "../../selection/hooks/use-rectangle-selection-overlay";
import type { AnnotationSelectionState } from "../../selection/types/annotation-selection.types";
import { useSceneModels } from "./use-scene-models";
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
};

type VisualizationDisplayParams = {
  showPoints: boolean;
  showPointLabels: boolean;
  effectiveReferenceElevation: number;
  occlusionChecksEnabled: boolean;
  options?: AnnotationsOptions;
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
  } = geometry;
  const {
    showPoints,
    showPointLabels,
    effectiveReferenceElevation,
    occlusionChecksEnabled,
    options,
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
  const { annotationCursorEnabled } = candidate;
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
  const showMeasurementGeometry = true;
  const showAnnotationLabels = true;

  const markerOnlyOverlayNodeInteractions =
    (annotationCursorEnabled && !isPointMeasureLabelModeActive) ||
    isPointMeasureLabelInputPending;
  const sceneModels = useSceneModels({
    scene,
    visiblePointEntries,
    visiblePolygonAnnotationsForRendering,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
    pointMarkerBadgeByPointId,
    candidateConnectionPreview: null,
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
};
