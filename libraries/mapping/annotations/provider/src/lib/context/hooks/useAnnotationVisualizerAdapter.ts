import { type Cartesian3, type Scene } from "@carma/cesium";
import {
  type AnnotationCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import {
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "@carma-mapping/annotations/cesium";
import { useDistanceVisualizerAdapter } from "./useDistanceVisualizerAdapter";
import { usePointMeasureVisualizer } from "./usePointMeasureVisualizer";

export type AnnotationVisualizerAdapterOptions = {
  scene: Scene | null;
  annotations: AnnotationCollection;
  showPoints: boolean;
  showPointLabels: boolean;
  pointRadius: number;
  referenceElevation: number;
  selectedMeasurementId: string | null;
  selectedMeasurementIds: string[];
  hiddenPointLabelIds: ReadonlySet<string>;
  fullyHiddenPointIds: ReadonlySet<string>;
  markerlessPointIds: ReadonlySet<string>;
  collapsedPillPointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  selectionModeActive: boolean;
  selectModeRectangle: boolean;
  effectiveSelectModeAdditive: boolean;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
  handlePointLabelClick: (pointId: string) => void;
  handlePointLabelDoubleClick: (pointId: string) => void;
  handlePointLabelLongPress: (pointId: string) => void;
  handlePointLabelHoverChange: (pointId: string, hovered: boolean) => void;
  handlePointVerticalOffsetStemLongPress: (pointId: string) => void;
  pointLongPressDurationMs: number;
  occlusionChecksEnabled: boolean;
  labelLayoutConfig?: CesiumLabelLayoutConfigOverrides;
  effectiveDistanceToReferenceByPointId: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId: Readonly<Record<string, PointMarkerBadge>>;
  labelInputPromptPointId: string | null;
  markerOnlyOverlayNodeInteractions: boolean;
  suppressLivePreviewLabelOverlay: boolean;
  livePreviewPointECEF: Cartesian3 | null;
  livePreviewSurfaceNormalECEF: Cartesian3 | null;
  livePreviewVerticalOffsetAnchorECEF: Cartesian3 | null;
  livePreviewDistanceLine: {
    anchorPointECEF: Cartesian3;
    targetPointECEF: Cartesian3;
    showDirectLine: boolean;
    showVerticalLine: boolean;
    showHorizontalLine: boolean;
  } | null;
  showDistanceAndPolygonVisuals: boolean;
  distanceRelations: PointDistanceRelation[];
  planarPolygonGroups: PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
  handleDistanceRelationLineLabelToggle: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationLineClick: (
    relationId: string,
    kind: ReferenceLineLabelKind
  ) => void;
  handleDistanceRelationMidpointClick: (relationId: string) => void;
  handleDistanceRelationCornerClick: (relationId: string) => void;
  referencePoint: Cartesian3 | null;
  moveGizmoAxisDirection: Cartesian3 | null;
  moveGizmoPreferredAxisId: string | null;
  moveGizmoMarkerSizeScale: number;
  moveGizmoLabelDistanceScale: number;
  moveGizmoSnapPlaneDragToGround: boolean;
  moveGizmoShowRotationHandle: boolean;
  isMoveGizmoDragging: boolean;
  handleMoveGizmoPointPositionChange: (
    pointId: string,
    nextPosition: Cartesian3
  ) => void;
  setIsMoveGizmoDragging: (isDragging: boolean) => void;
  handleMoveGizmoAxisChange: (
    axisDirection: Cartesian3,
    axisTitle?: string | null
  ) => void;
  handleMoveGizmoExit: () => void;
};

// Current adapter scope: point/pure-label/selection plus distance family visuals.
export const useAnnotationVisualizerAdapter = ({
  scene,
  annotations,
  showPoints,
  showPointLabels,
  pointRadius,
  referenceElevation,
  selectedMeasurementId,
  selectedMeasurementIds,
  hiddenPointLabelIds,
  fullyHiddenPointIds,
  markerlessPointIds,
  collapsedPillPointIds,
  moveGizmoPointId,
  selectionModeActive,
  selectModeRectangle,
  effectiveSelectModeAdditive,
  selectMeasurementIds,
  handlePointLabelClick,
  handlePointLabelDoubleClick,
  handlePointLabelLongPress,
  handlePointLabelHoverChange,
  handlePointVerticalOffsetStemLongPress,
  pointLongPressDurationMs,
  occlusionChecksEnabled,
  labelLayoutConfig,
  effectiveDistanceToReferenceByPointId,
  pointMarkerBadgeByPointId,
  labelInputPromptPointId,
  markerOnlyOverlayNodeInteractions,
  suppressLivePreviewLabelOverlay,
  livePreviewPointECEF,
  livePreviewSurfaceNormalECEF,
  livePreviewVerticalOffsetAnchorECEF,
  livePreviewDistanceLine,
  showDistanceAndPolygonVisuals,
  distanceRelations,
  planarPolygonGroups,
  selectedPlanarPolygonGroupId,
  activePlanarPolygonGroupId,
  cumulativeDistanceByRelationId,
  handleDistanceRelationLineLabelToggle,
  handleDistanceRelationLineClick,
  handleDistanceRelationMidpointClick,
  handleDistanceRelationCornerClick,
  referencePoint,
  moveGizmoAxisDirection,
  moveGizmoPreferredAxisId,
  moveGizmoMarkerSizeScale,
  moveGizmoLabelDistanceScale,
  moveGizmoSnapPlaneDragToGround,
  moveGizmoShowRotationHandle,
  isMoveGizmoDragging,
  handleMoveGizmoPointPositionChange,
  setIsMoveGizmoDragging,
  handleMoveGizmoAxisChange,
  handleMoveGizmoExit,
}: AnnotationVisualizerAdapterOptions) => {
  useDistanceVisualizerAdapter({
    scene,
    enabled: showDistanceAndPolygonVisuals,
    annotations,
    distanceRelations,
    planarPolygonGroups,
    selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId,
    onDistanceLineLabelToggle: handleDistanceRelationLineLabelToggle,
    onDistanceLineClick: handleDistanceRelationLineClick,
    onDistanceRelationMidpointClick: handleDistanceRelationMidpointClick,
    onDistanceRelationCornerClick: handleDistanceRelationCornerClick,
    cumulativeDistanceByRelationId,
    pointMarkerBadgeByPointId,
    livePreviewDistanceLine,
  });

  usePointMeasureVisualizer({
    scene,
    annotations,
    showMarkers: showPoints,
    showLabels: showPointLabels,
    radius: pointRadius,
    referenceElevation,
    selectedPointId: selectedMeasurementId,
    selectedPointIds: selectedMeasurementIds,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    pillMarkerPointIds: collapsedPillPointIds,
    showSelectedDisc: Boolean(moveGizmoPointId),
    onPointClick: handlePointLabelClick,
    onPointDoubleClick: handlePointLabelDoubleClick,
    onPointLongPress: handlePointLabelLongPress,
    onPointHoverChange: handlePointLabelHoverChange,
    onPointVerticalOffsetStemLongPress: handlePointVerticalOffsetStemLongPress,
    selectionModeEnabled: selectionModeActive,
    selectionRectangleModeEnabled: selectModeRectangle,
    selectionAdditiveMode: effectiveSelectModeAdditive,
    onPointRectangleSelect: selectMeasurementIds,
    pointLongPressDurationMs,
    occlusionChecksEnabled,
    labelLayoutConfig,
    distanceToReferenceByPointId: effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    labelInputPromptPointId,
    markerOnlyOverlayNodeInteractions,
    suppressLivePreviewLabelOverlay,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoPointId,
    moveGizmoMarkerSizeScale,
    moveGizmoLabelDistanceScale,
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
    livePreviewVerticalOffsetAnchorECEF,
    livePreviewDistanceLine,
    livePreviewReferenceElevation: referenceElevation,
    livePreviewHasReferenceElevation: Boolean(referencePoint),
    moveGizmoSnapPlaneDragToGround,
    moveGizmoShowRotationHandle,
    moveGizmoIsDragging: isMoveGizmoDragging,
    onMoveGizmoPointPositionChange: handleMoveGizmoPointPositionChange,
    onMoveGizmoDragStateChange: setIsMoveGizmoDragging,
    onMoveGizmoAxisChange: handleMoveGizmoAxisChange,
    onMoveGizmoExit: handleMoveGizmoExit,
  });
};
