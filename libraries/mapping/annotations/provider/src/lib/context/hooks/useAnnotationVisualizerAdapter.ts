import { type Cartesian3, type Scene } from "@carma/cesium";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";
import {
  type AnnotationCollection,
  type AnnotationPointMarkerBadge,
  type PlanarPolygonGroup,
  type PointDistanceRelation,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import type { EdgeCandidateLine } from "./annotationVisualization.types";
import { useAreaMeasurementVisualizerAdapter } from "./area/useAreaMeasurementVisualizerAdapter";
import { useEdgeVisualizerAdapter } from "./edge/useEdgeVisualizerAdapter";
import { usePlanarMeasurementPreviewModels } from "./planar/usePlanarMeasurementPreviewModels";
import { usePointAnnotationIndex } from "./usePointAnnotationIndex";
import { usePointMeasurementVisualizerAdapter } from "./point/usePointMeasurementVisualizerAdapter";
import { usePolylineMeasurementVisualizerAdapter } from "./polyline/usePolylineMeasurementVisualizerAdapter";

export type AnnotationVisualizerMeasurements = {
  annotations: AnnotationCollection;
  distanceRelations: readonly PointDistanceRelation[];
  planarPolygonGroups: readonly PlanarPolygonGroup[];
  selectedPlanarPolygonGroupId: string | null;
  activePlanarPolygonGroupId: string | null;
  cumulativeDistanceByRelationId: Readonly<Record<string, number>>;
};

export type AnnotationVisualizerLabels = {
  showPointNodes: boolean;
  showPointLabels: boolean;
  referenceElevation: number;
  occlusionChecksEnabled: boolean;
  labelLayoutConfig?: PointLabelLayoutConfigOverrides;
  effectiveDistanceToReferenceByPointId: Readonly<Record<string, number>>;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  hiddenPointLabelIds: ReadonlySet<string>;
  fullyHiddenPointIds: ReadonlySet<string>;
  markerlessPointIds: ReadonlySet<string>;
  collapsedPillPointIds: ReadonlySet<string>;
  labelInputPromptPointId: string | null;
  markerOnlyOverlayNodeInteractions: boolean;
  interactivePointIds: ReadonlySet<string>;
};

export type AnnotationVisualizerSelection = {
  selectedMeasurementId: string | null;
  selectedMeasurementIds: readonly string[];
  selectionModeActive: boolean;
  selectModeRectangle: boolean;
  effectiveSelectModeAdditive: boolean;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
};

export type AnnotationVisualizerEditing = {
  editingPointId: string | null;
  editingMarkerSizeScale: number;
  editingLabelDistanceScale: number;
  isPointEditingDragging: boolean;
};

export type AnnotationVisualizerPointInteractions = {
  handlePointLabelClick: (pointId: string) => void;
  handlePointLabelDoubleClick: (pointId: string) => void;
  handlePointLabelLongPress: (pointId: string) => void;
  handlePointLabelHoverChange: (
    pointId: string,
    hovered: boolean,
    anchorPosition?: { x: number; y: number } | null
  ) => void;
  handlePointVerticalOffsetStemLongPress: (pointId: string) => void;
  pointLongPressDurationMs: number;
};

export type AnnotationVisualizerEdgeInteractions = {
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
};

export type AnnotationVisualizerCandidate = {
  suppressCandidateLabelOverlay: boolean;
  candidatePointECEF: Cartesian3 | null;
  candidateScreenPosition: { x: number; y: number } | null;
  candidateSurfaceNormalECEF: Cartesian3 | null;
  candidateVerticalOffsetAnchorECEF: Cartesian3 | null;
  candidateEdgeLine: EdgeCandidateLine;
  referencePoint: Cartesian3 | null;
};

export type AnnotationVisualizerDisplay = {
  pointRadius: number;
  showEdgeAndPolygonVisuals: boolean;
};

export type AnnotationVisualizerAdapterOptions = {
  scene: Scene | null;
  measurements: AnnotationVisualizerMeasurements;
  labels: AnnotationVisualizerLabels;
  selection: AnnotationVisualizerSelection;
  editing: AnnotationVisualizerEditing;
  pointInteractions: AnnotationVisualizerPointInteractions;
  edgeInteractions: AnnotationVisualizerEdgeInteractions;
  candidate: AnnotationVisualizerCandidate;
  display: AnnotationVisualizerDisplay;
};

// Thin coordinator: index shared measurement state once, then delegate to
// focused point, edge, polyline, and area visualizers.
export const useAnnotationVisualizerAdapter = ({
  scene,
  measurements,
  labels,
  selection,
  editing,
  pointInteractions,
  edgeInteractions,
  candidate,
  display,
}: AnnotationVisualizerAdapterOptions) => {
  const { points, pointsById } = usePointAnnotationIndex(
    measurements.annotations
  );
  const planarMeasurementPreviewModels = usePlanarMeasurementPreviewModels({
    enabled: display.showEdgeAndPolygonVisuals,
    planarPolygonGroups: measurements.planarPolygonGroups,
    pointsById,
    selectedPlanarPolygonGroupId: measurements.selectedPlanarPolygonGroupId,
    activePlanarPolygonGroupId: measurements.activePlanarPolygonGroupId,
    pointMarkerBadgeByPointId: labels.pointMarkerBadgeByPointId,
    candidateEdgeLine: candidate.candidateEdgeLine,
  });

  useEdgeVisualizerAdapter({
    scene,
    points,
    pointsById,
    measurements: {
      relations: measurements.distanceRelations,
      planarPolygonGroups: measurements.planarPolygonGroups,
      selectedPlanarPolygonGroupId: measurements.selectedPlanarPolygonGroupId,
      activePlanarPolygonGroupId: measurements.activePlanarPolygonGroupId,
      cumulativeDistanceByRelationId:
        measurements.cumulativeDistanceByRelationId,
      pointMarkerBadgeByPointId: labels.pointMarkerBadgeByPointId,
    },
    interactions: {
      onLineLabelToggle: edgeInteractions.handleDistanceRelationLineLabelToggle,
      onLineClick: edgeInteractions.handleDistanceRelationLineClick,
      onMidpointClick: edgeInteractions.handleDistanceRelationMidpointClick,
      onCornerClick: edgeInteractions.handleDistanceRelationCornerClick,
    },
    candidateEdge: candidate.candidateEdgeLine,
    transientEdges: [
      ...planarMeasurementPreviewModels.facadePreviewEdges,
      ...planarMeasurementPreviewModels.polygonClosurePreviewEdges,
    ],
    display: {
      enabled: display.showEdgeAndPolygonVisuals,
      renderOverlays: display.showEdgeAndPolygonVisuals,
      renderSceneLines: display.showEdgeAndPolygonVisuals,
    },
  });

  usePolylineMeasurementVisualizerAdapter({
    scene,
    measurements: planarMeasurementPreviewModels.polylineMeasurements,
    enabled: display.showEdgeAndPolygonVisuals,
  });

  useAreaMeasurementVisualizerAdapter({
    scene,
    enabled: display.showEdgeAndPolygonVisuals,
    focusedPolygonGroupId: planarMeasurementPreviewModels.focusedPolygonGroupId,
    polygonAreaBadgeByGroupId:
      planarMeasurementPreviewModels.polygonAreaBadgeByGroupId,
    groundPolygonPreviewGroups:
      planarMeasurementPreviewModels.groundPolygonPreviewGroups,
    verticalPolygonPreviewGroups:
      planarMeasurementPreviewModels.verticalPolygonPreviewGroups,
    planarPolygonPreviewGroups:
      planarMeasurementPreviewModels.planarPolygonPreviewGroups,
    groundPolygonPrimitives:
      planarMeasurementPreviewModels.groundPolygonPrimitives,
    verticalPolygonPrimitives:
      planarMeasurementPreviewModels.verticalPolygonPrimitives,
    planarPolygonPrimitives:
      planarMeasurementPreviewModels.planarPolygonPrimitives,
  });

  usePointMeasurementVisualizerAdapter({
    scene,
    points,
    display: {
      enabled: labels.showPointNodes,
      showLabels: labels.showPointLabels,
      pointRadius: display.pointRadius,
      referenceElevation: labels.referenceElevation,
      occlusionChecksEnabled: labels.occlusionChecksEnabled,
      labelLayoutConfig: labels.labelLayoutConfig,
      distanceToReferenceByPointId:
        labels.effectiveDistanceToReferenceByPointId,
      hiddenPointLabelIds: labels.hiddenPointLabelIds,
      fullyHiddenPointIds: labels.fullyHiddenPointIds,
      markerlessPointIds: labels.markerlessPointIds,
      collapsedPillPointIds: labels.collapsedPillPointIds,
      pointMarkerBadgeByPointId: labels.pointMarkerBadgeByPointId,
      labelInputPromptPointId: labels.labelInputPromptPointId,
      markerOnlyOverlayNodeInteractions:
        labels.markerOnlyOverlayNodeInteractions,
      interactivePointIds: labels.interactivePointIds,
    },
    selection: {
      selectedMeasurementId: selection.selectedMeasurementId,
      selectedMeasurementIds: selection.selectedMeasurementIds,
      selectionModeActive: selection.selectionModeActive,
      selectModeRectangle: selection.selectModeRectangle,
      effectiveSelectModeAdditive: selection.effectiveSelectModeAdditive,
      selectMeasurementIds: selection.selectMeasurementIds,
    },
    editing: {
      editingPointId: editing.editingPointId,
      editingMarkerSizeScale: editing.editingMarkerSizeScale,
      editingLabelDistanceScale: editing.editingLabelDistanceScale,
      isPointEditingDragging: editing.isPointEditingDragging,
    },
    interactions: pointInteractions,
    candidate: {
      suppressCandidateLabelOverlay: candidate.suppressCandidateLabelOverlay,
      pointECEF: candidate.candidatePointECEF,
      screenPosition: candidate.candidateScreenPosition,
      surfaceNormalECEF: candidate.candidateSurfaceNormalECEF,
      verticalOffsetAnchorECEF: candidate.candidateVerticalOffsetAnchorECEF,
      distanceLine: candidate.candidateEdgeLine,
      referencePoint: candidate.referencePoint,
    },
  });
};
