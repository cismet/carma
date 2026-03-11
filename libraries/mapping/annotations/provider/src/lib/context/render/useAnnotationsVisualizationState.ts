import type { Dispatch, SetStateAction } from "react";

import { type Cartesian3, type Scene } from "@carma/cesium";
import type {
  AnnotationCollection,
  AnnotationMode,
  AnnotationToolType,
  LinearSegmentLineMode,
  NodeChainAnnotation,
  PointAnnotationEntry,
  PointDistanceRelation,
  PointMeasurementEntry,
  ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";

import { useCandidatePreviewState } from "../interaction/candidate/useCandidatePreviewState";
import { useClosedAreaSelectionState } from "../selection/useClosedAreaSelectionState";
import { useDerivedPolylineState } from "../topology/polyline/useDerivedPolylineState";
import { useAnnotationsPolylineState } from "../topology/polyline/useAnnotationsPolylineState";
import { useAnnotationPointDisplayState } from "./point/useAnnotationPointDisplayState";
import { useAnnotationsRenderState } from "./useAnnotationsRenderState";

const POLYLINE_VERTICAL_OFFSET_VISUAL_ONLY = true;

type UseAnnotationsVisualizationStateParams = {
  scene: Scene;
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  pointEntries: PointAnnotationEntry[];
  pointMeasureEntries: PointMeasurementEntry[];
  referencePoint: Cartesian3 | null;
  defaultPolylineVerticalOffsetMeters: number;
  hideMeasurementsOfType: Set<AnnotationMode>;
  hideLabelsOfType: Set<AnnotationMode>;
  showLabels: boolean;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  annotationCursorEnabled: boolean;
  activeToolType: AnnotationToolType;
  distanceModeStickyToFirstPoint: boolean;
  referencePointMeasurementId: string | null;
  doubleClickChainSourcePointId: string | null;
  selectablePointIds: ReadonlySet<string>;
  moveGizmoPointId: string | null;
  activeCandidateNodeECEF: Cartesian3 | null;
  candidateSupportsEdgeLine: boolean;
  resolveDistanceRelationSourcePointId: (
    targetPointId: string
  ) => string | null;
  candidateForcesDirectEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  polylineSegmentLineMode: LinearSegmentLineMode;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  isPolylineCandidateMode: boolean;
  defaultDistanceRelationLabelVisibility: Record<
    ReferenceLineLabelKind,
    boolean
  >;
};

export const useAnnotationsVisualizationState = ({
  scene,
  annotations,
  distanceRelations,
  nodeChainAnnotations,
  pointEntries,
  pointMeasureEntries,
  referencePoint,
  defaultPolylineVerticalOffsetMeters,
  hideMeasurementsOfType,
  hideLabelsOfType,
  showLabels,
  setAnnotations,
  selectedAnnotationId,
  selectedAnnotationIds,
  focusedNodeChainAnnotationId,
  activeNodeChainAnnotationId,
  annotationCursorEnabled,
  activeToolType,
  distanceModeStickyToFirstPoint,
  referencePointMeasurementId,
  doubleClickChainSourcePointId,
  selectablePointIds,
  moveGizmoPointId,
  activeCandidateNodeECEF,
  candidateSupportsEdgeLine,
  resolveDistanceRelationSourcePointId,
  candidateForcesDirectEdgeLine,
  candidateUsesPolylineEdgeRules,
  polylineSegmentLineMode,
  distanceCreationLineVisibility,
  isPolylineCandidateMode,
  defaultDistanceRelationLabelVisibility,
}: UseAnnotationsVisualizationStateParams) => {
  const { polylines, referenceElevation } = useDerivedPolylineState(
    scene,
    annotations,
    nodeChainAnnotations,
    defaultPolylineVerticalOffsetMeters,
    POLYLINE_VERTICAL_OFFSET_VISUAL_ONLY,
    referencePoint
  );

  const {
    focusedPolylineDistanceToStartByPointId,
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    unfocusedPolylineNonLastIds,
  } = useAnnotationsPolylineState(annotations, polylines, {
    focusedNodeChainAnnotationId,
    referencePoint,
    referenceElevation,
  });

  const { unselectedClosedAreaNodeIdSet } = useClosedAreaSelectionState(
    nodeChainAnnotations,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId
  );

  const {
    pointMarkerBadgeByPointId,
    standaloneDistancePointState,
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
    showPoints,
    showPointLabels,
    lockedMeasurementIdSet,
  } = useAnnotationPointDisplayState({
    annotations,
    pointEntries,
    pointMeasureEntries,
    nodeChainAnnotations,
    distanceRelations,
    selectedAnnotationId,
    selectedAnnotationIds,
    polylines,
    focusedNodeChainAnnotationId,
    unselectedClosedAreaNodeIdSet,
    hideAnnotationsOfType: hideMeasurementsOfType,
    hideLabelsOfType,
    showLabels,
    setAnnotations,
  });

  const {
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  } = standaloneDistancePointState;

  const {
    markerlessPointIds,
    visibleMeasurementsForRendering,
    visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
  } = useAnnotationsRenderState(
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    {
      selectedAnnotationId,
      selectedAnnotationIds,
      pointIdsWithoutLabelAnchor,
      unselectedClosedAreaNodeIdSet,
      unfocusedStandaloneDistanceNonHighestPointIds,
      focusedStandaloneDistanceNonHighestPointIds,
      labelAnchorPointIdsWithForcedVisibility,
      unfocusedPolylineNonLastIds,
      annotationCursorEnabled,
      defaultDistanceRelationLabelVisibility,
    }
  );

  const {
    activeMeasurementId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  } = useCandidatePreviewState({
    activeToolType,
    distanceModeStickyToFirstPoint,
    referencePointMeasurementId,
    doubleClickChainSourcePointId,
    selectablePointIds,
    moveGizmoPointId,
    selectedAnnotationId,
    candidateSupportsEdgeLine,
    resolveDistanceRelationSourcePointId,
    activeCandidateNodeECEF,
    annotations,
    candidateForcesDirectEdgeLine,
    candidateUsesPolylineEdgeRules,
    polylineSegmentLineMode,
    distanceCreationLineVisibility,
    isPolylineCandidateMode,
    focusedPolylineDistanceToStartByPointId,
  });

  return {
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    collapsedPillPointIds,
    showPoints,
    showPointLabels,
    lockedMeasurementIdSet,
    markerlessPointIds,
    visibleMeasurementsForRendering,
    visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
    activeMeasurementId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  };
};

export type AnnotationsVisualizationState = ReturnType<
  typeof useAnnotationsVisualizationState
>;
