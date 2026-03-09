import { type Cartesian3, type Scene } from "@carma/cesium";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";
import {
  type AnnotationPointMarkerBadge,
  type PointAnnotationEntry,
} from "@carma-mapping/annotations/core";

import type { EdgeCandidateLine } from "../annotationVisualization.types";
import { useMeasurementCursorOverlay } from "../preview/useMeasurementCursorOverlay";
import { usePointCandidateDomOverlay } from "../candidate/usePointCandidateDomOverlay";
import { usePointCandidateRingIndicator } from "../candidate/usePointCandidateRingIndicator";
import { usePointLabelVisualizer } from "./usePointLabelVisualizer";

export type PointMeasurementVisualizerDisplay = {
  enabled: boolean;
  showLabels: boolean;
  pointRadius: number;
  referenceElevation: number;
  occlusionChecksEnabled: boolean;
  labelLayoutConfig?: PointLabelLayoutConfigOverrides;
  distanceToReferenceByPointId: Readonly<Record<string, number>>;
  hiddenPointLabelIds: ReadonlySet<string>;
  fullyHiddenPointIds: ReadonlySet<string>;
  markerlessPointIds: ReadonlySet<string>;
  collapsedPillPointIds: ReadonlySet<string>;
  pointMarkerBadgeByPointId: Readonly<
    Record<string, AnnotationPointMarkerBadge>
  >;
  labelInputPromptPointId: string | null;
  markerOnlyOverlayNodeInteractions: boolean;
  interactivePointIds: ReadonlySet<string>;
};

export type PointMeasurementVisualizerSelection = {
  selectedMeasurementId: string | null;
  selectedMeasurementIds: readonly string[];
  selectionModeActive: boolean;
  selectModeRectangle: boolean;
  effectiveSelectModeAdditive: boolean;
  selectMeasurementIds: (ids: string[], additive?: boolean) => void;
};

export type PointMeasurementVisualizerEditing = {
  editingPointId: string | null;
  editingMarkerSizeScale: number;
  editingLabelDistanceScale: number;
  isPointEditingDragging: boolean;
};

export type PointMeasurementVisualizerInteractions = {
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

export type PointMeasurementVisualizerCandidate = {
  suppressCandidateLabelOverlay: boolean;
  pointECEF: Cartesian3 | null;
  screenPosition: { x: number; y: number } | null;
  surfaceNormalECEF: Cartesian3 | null;
  verticalOffsetAnchorECEF: Cartesian3 | null;
  distanceLine: EdgeCandidateLine;
  referencePoint: Cartesian3 | null;
};

export type PointMeasurementVisualizerAdapterOptions = {
  scene: Scene | null;
  points: readonly PointAnnotationEntry[];
  display: PointMeasurementVisualizerDisplay;
  selection: PointMeasurementVisualizerSelection;
  editing: PointMeasurementVisualizerEditing;
  interactions: PointMeasurementVisualizerInteractions;
  candidate: PointMeasurementVisualizerCandidate;
};

export const usePointMeasurementVisualizerAdapter = ({
  scene,
  points,
  display,
  selection,
  editing,
  interactions,
  candidate,
}: PointMeasurementVisualizerAdapterOptions) => {
  const {
    enabled,
    showLabels,
    pointRadius,
    referenceElevation,
    occlusionChecksEnabled,
    labelLayoutConfig,
    distanceToReferenceByPointId,
    hiddenPointLabelIds,
    fullyHiddenPointIds,
    markerlessPointIds,
    collapsedPillPointIds,
    pointMarkerBadgeByPointId,
    labelInputPromptPointId,
    markerOnlyOverlayNodeInteractions,
    interactivePointIds,
  } = display;
  const {
    selectedMeasurementId,
    selectedMeasurementIds,
    selectionModeActive,
    selectModeRectangle,
    effectiveSelectModeAdditive,
    selectMeasurementIds,
  } = selection;
  const {
    editingPointId,
    editingMarkerSizeScale,
    editingLabelDistanceScale,
    isPointEditingDragging,
  } = editing;
  const {
    handlePointLabelClick,
    handlePointLabelDoubleClick,
    handlePointLabelLongPress,
    handlePointLabelHoverChange,
    handlePointVerticalOffsetStemLongPress,
    pointLongPressDurationMs,
  } = interactions;
  const {
    suppressCandidateLabelOverlay,
    pointECEF,
    screenPosition,
    surfaceNormalECEF,
    verticalOffsetAnchorECEF,
    distanceLine,
    referencePoint,
  } = candidate;

  usePointCandidateRingIndicator({
    scene,
    radius: pointRadius,
    candidate: {
      pointECEF,
      surfaceNormalECEF,
      verticalOffsetAnchorECEF,
    },
  });

  useMeasurementCursorOverlay({
    enabled: enabled && Boolean(pointECEF) && !verticalOffsetAnchorECEF,
    cursorScreenPosition: screenPosition,
  });

  usePointLabelVisualizer({
    scene,
    points: [...points],
    display: {
      enabled,
      showLabels,
      referenceElevation,
      occlusionChecksEnabled,
      labelLayoutConfig,
      distanceToReferenceByPointId,
      hiddenPointLabelIds,
      fullyHiddenPointIds,
      markerlessPointIds,
      pillMarkerPointIds: collapsedPillPointIds,
      pointMarkerBadgeByPointId,
      labelInputPromptPointId,
      markerOnlyOverlayNodeInteractions,
      interactivePointIds,
    },
    selection: {
      selectedPointId: selectedMeasurementId,
      selectedPointIds: [...selectedMeasurementIds],
      selectionModeEnabled: selectionModeActive,
      selectionRectangleModeEnabled: selectModeRectangle,
      selectionAdditiveMode: effectiveSelectModeAdditive,
      onPointRectangleSelect: selectMeasurementIds,
    },
    editing: {
      editingPointId,
      editingPointIsDragging: isPointEditingDragging,
      editingPointMarkerSizeScale: editingMarkerSizeScale,
      editingPointLabelDistanceScale: editingLabelDistanceScale,
    },
    interactions: {
      onPointClick: handlePointLabelClick,
      onPointDoubleClick: handlePointLabelDoubleClick,
      onPointLongPress: handlePointLabelLongPress,
      onPointHoverChange: handlePointLabelHoverChange,
      onPointVerticalOffsetStemLongPress:
        handlePointVerticalOffsetStemLongPress,
      pointLongPressDurationMs,
    },
  });

  usePointCandidateDomOverlay({
    scene,
    labelLayoutConfig,
    candidate: {
      pointECEF,
      verticalOffsetAnchorECEF,
      distanceLine,
      referenceElevation,
      hasReferenceElevation: Boolean(referencePoint),
      suppressLabelOverlay: suppressCandidateLabelOverlay,
    },
  });
};
