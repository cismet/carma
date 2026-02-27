import { type Cartesian3, type Scene } from "@carma/cesium";

import {
  type MeasurementCollection,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "../types/MeasurementTypes";
import { useCesiumDistanceVisualizerAdapter } from "./useCesiumDistanceVisualizerAdapter";
import { usePointMeasureVisualizer } from "./usePointMeasureVisualizer";
import {
  type CesiumLabelLayoutConfigOverrides,
  type PointMarkerBadge,
} from "./useCesiumPointLabels";

export type CesiumMeasurementVisualizerAdapterOptions = {
  scene: Scene | null;
  measurements: MeasurementCollection;
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
  isPointMeasureLabelModeActive: boolean;
  pointMeasurementIds: ReadonlySet<string>;
  markerOnlyOverlayNodeInteractions: boolean;
  livePreviewPointECEF: Cartesian3 | null;
  livePreviewSurfaceNormalECEF: Cartesian3 | null;
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
export const useCesiumMeasurementVisualizerAdapter = ({
  scene,
  measurements,
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
  isPointMeasureLabelModeActive,
  pointMeasurementIds,
  markerOnlyOverlayNodeInteractions,
  livePreviewPointECEF,
  livePreviewSurfaceNormalECEF,
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
}: CesiumMeasurementVisualizerAdapterOptions) => {
  useCesiumDistanceVisualizerAdapter({
    scene,
    enabled: showDistanceAndPolygonVisuals,
    measurements,
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
    measurements,
    showMarkers: showPoints,
    showCesiumMarkers: false,
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
    labelInputPromptPointId:
      isPointMeasureLabelModeActive &&
      !selectionModeActive &&
      selectedMeasurementId &&
      pointMeasurementIds.has(selectedMeasurementId)
        ? selectedMeasurementId
        : null,
    markerOnlyOverlayNodeInteractions,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoPointId,
    moveGizmoMarkerSizeScale,
    moveGizmoLabelDistanceScale,
    livePreviewPointECEF,
    livePreviewSurfaceNormalECEF,
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
