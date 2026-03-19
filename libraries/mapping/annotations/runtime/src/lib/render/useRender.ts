import { useMemo, type Dispatch, type SetStateAction } from "react";

import type { Cartesian3, Scene } from "@carma/cesium";
import { useStoreSelector } from "@carma-commons/react-store";
import {
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
  AnnotationCollection,
  AnnotationMode,
  AnnotationToolType,
  LinearSegmentLineMode,
  NodeChainAnnotation,
  PointDistanceRelation,
  isPointMeasurementEntry,
} from "@carma-mapping/annotations/core";

import type { AnnotationsOptions } from "../config/annotationsOptions";
import type { EditingState } from "../interaction/editing/useEditing";
import { useToolCandidatePreview } from "../interaction/useInteraction";
import type { UserInteractionState } from "../interaction/lifecycle/modes/useUserInteraction";
import type { RectangleSelectionState } from "../selection/hooks/useRectangleSelectionOverlay";
import type { AnnotationSelectionState } from "../selection/types/annotationSelection.types";
import type { AnnotationsStore } from "../store";
import {
  isPointVisibleForRendering,
  useClosedAreaBridge,
  usePointBridge,
  usePolylineBridge,
  useVisibilityBridge,
} from "./bridge";
import { usePointIndex } from "./point/usePointIndex";
import { useOverlayPositionSync } from "./scene/useOverlayPositionSync";
import { useVisualization } from "./scene/useVisualization";

export {
  usePointMarkerBadges,
  type AnnotationPointMarkerBadge,
} from "./point/usePointMarkerBadges";
export { usePointIndex } from "./point/usePointIndex";

type RenderBridgeDataParams = {
  annotations: AnnotationCollection;
  distanceRelations: PointDistanceRelation[];
  nodeChainAnnotations: NodeChainAnnotation[];
  referencePoint: Cartesian3 | null;
  defaultPolylineVerticalOffsetMeters: number;
  setAnnotations: Dispatch<SetStateAction<AnnotationCollection>>;
};

type RenderBridgeDisplayParams = {
  hideMeasurementsOfType: Set<AnnotationMode>;
  hideLabelsOfType: Set<AnnotationMode>;
  showLabels: boolean;
  annotationCursorEnabled: boolean;
};

type RenderBridgeSelectionParams = {
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
};

type RenderBridgeCandidateSessionParams = {
  annotationsStore: AnnotationsStore;
  referencePointMeasurementId: string | null;
  selectablePointIds: ReadonlySet<string>;
  activeNodeChainAnnotationId: string | null;
  nodeChainAnnotations: readonly NodeChainAnnotation[];
};

type RenderBridgeCandidatePointerParams = {
  activeCandidateNodeECEF: Cartesian3 | null;
  candidateSupportsEdgeLine: boolean;
};

type RenderBridgeCandidatePreviewParams = {
  candidateForcesDirectEdgeLine: boolean;
  candidateUsesPolylineEdgeRules: boolean;
  polylineSegmentLineMode: LinearSegmentLineMode;
  distanceCreationLineVisibility: {
    direct: boolean;
    vertical: boolean;
    horizontal: boolean;
  };
  isPolylineCandidateMode: boolean;
};

type RenderBridgeCandidateParams = {
  session: RenderBridgeCandidateSessionParams;
  pointer: RenderBridgeCandidatePointerParams;
  preview: RenderBridgeCandidatePreviewParams;
};

type UseRenderBridgeStateParams = {
  scene: Scene;
  data: RenderBridgeDataParams;
  display: RenderBridgeDisplayParams;
  selection: RenderBridgeSelectionParams;
  candidate: RenderBridgeCandidateParams;
};

export const useRenderBridgeState = ({
  scene,
  data,
  display,
  selection,
  candidate,
}: UseRenderBridgeStateParams) => {
  const {
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    referencePoint,
    defaultPolylineVerticalOffsetMeters,
    setAnnotations,
  } = data;
  const {
    hideMeasurementsOfType,
    hideLabelsOfType,
    showLabels,
    annotationCursorEnabled,
  } = display;
  const {
    selectedAnnotationId,
    selectedAnnotationIds,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
  } = selection;
  const {
    session: candidateSession,
    pointer: candidatePointer,
    preview: candidatePreview,
  } = candidate;
  const activeToolType = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.annotationToolType
  );
  const labelInputPromptPointId = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const showAllPointOverlays =
    activeToolType === SELECT_TOOL_TYPE || labelInputPromptPointId !== null;
  const { points: pointEntries } = usePointIndex(annotations);
  const pointMeasurementEntries = annotations.filter(isPointMeasurementEntry);
  const visiblePointEntries = useMemo(
    () =>
      pointEntries.filter((annotation) =>
        isPointVisibleForRendering(
          annotation,
          hideMeasurementsOfType,
          hideLabelsOfType,
          showLabels
        )
      ),
    [hideLabelsOfType, hideMeasurementsOfType, pointEntries, showLabels]
  );

  const polylineBridge = usePolylineBridge({
    scene,
    annotations,
    nodeChainAnnotations,
    focusedNodeChainAnnotationId,
    defaultPolylineVerticalOffsetMeters,
    referencePoint,
  });

  const closedAreaBridge = useClosedAreaBridge({
    nodeChainAnnotations,
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
  });

  const pointBridge = usePointBridge({
    annotations,
    pointEntries,
    visiblePointEntries,
    pointMeasurementEntries,
    nodeChainAnnotations,
    distanceRelations,
    selectedAnnotationId,
    selectedAnnotationIds,
    polylines: polylineBridge.polylines,
    focusedNodeChainAnnotationId,
    unselectedClosedAreaNodeIdSet:
      closedAreaBridge.unselectedClosedAreaNodeIdSet,
    showLabels,
    hidePointLabels: hideLabelsOfType.has(ANNOTATION_TYPE_POINT),
    setAnnotations,
  });

  const {
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  } = pointBridge.standaloneDistancePointState;

  const visibilityBridge = useVisibilityBridge({
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    selectedAnnotationId,
    pointIdsWithoutLabelAnchor: pointBridge.pointIdsWithoutLabelAnchor,
    unselectedClosedAreaNodeIdSet:
      closedAreaBridge.unselectedClosedAreaNodeIdSet,
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
    labelAnchorPointIdsWithForcedVisibility:
      pointBridge.labelAnchorPointIdsWithForcedVisibility,
    unfocusedPolylineNonLastIds: polylineBridge.unfocusedPolylineNonLastIds,
    annotationCursorEnabled,
    showAllPointOverlays,
  });

  const candidateState = useToolCandidatePreview({
    annotationsStore: candidateSession.annotationsStore,
    referencePointMeasurementId: candidateSession.referencePointMeasurementId,
    selectablePointIds: candidateSession.selectablePointIds,
    activeNodeChainAnnotationId: candidateSession.activeNodeChainAnnotationId,
    nodeChainAnnotations: candidateSession.nodeChainAnnotations,
    activeCandidateNodeECEF: candidatePointer.activeCandidateNodeECEF,
    annotations,
    focusedPolylineDistanceToStartByPointId:
      polylineBridge.focusedPolylineDistanceToStartByPointId,
    candidateSupportsEdgeLine: candidatePointer.candidateSupportsEdgeLine,
    candidateForcesDirectEdgeLine:
      candidatePreview.candidateForcesDirectEdgeLine,
    candidateUsesPolylineEdgeRules:
      candidatePreview.candidateUsesPolylineEdgeRules,
    polylineSegmentLineMode: candidatePreview.polylineSegmentLineMode,
    distanceCreationLineVisibility:
      candidatePreview.distanceCreationLineVisibility,
    isPolylineCandidateMode: candidatePreview.isPolylineCandidateMode,
  });

  return {
    cumulativeDistanceByRelationId:
      polylineBridge.cumulativeDistanceByRelationId,
    effectiveReferenceElevation: polylineBridge.effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId:
      polylineBridge.effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId: pointBridge.pointMarkerBadgeByPointId,
    collapsedPillPointIds: pointBridge.collapsedPillPointIds,
    visiblePointEntries,
    showPoints: pointBridge.showPoints,
    showPointLabels: pointBridge.showPointLabels,
    lockedAnnotationIdSet: pointBridge.lockedAnnotationIdSet,
    markerlessPointIds: visibilityBridge.markerlessPointIds,
    visiblePolygonAnnotationsForRendering:
      visibilityBridge.visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering:
      visibilityBridge.effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds: visibilityBridge.hiddenPointLabelIds,
    effectiveFullyHiddenPointIds: visibilityBridge.effectiveFullyHiddenPointIds,
    currentAnnotationId: candidateState.currentAnnotationId,
    candidateConnectionPreview: candidateState.candidateConnectionPreview,
    candidatePreviewDistanceMeters:
      candidateState.candidatePreviewDistanceMeters,
  };
};

export type RenderBridgeState = ReturnType<typeof useRenderBridgeState>;

type RenderEffectsSceneParams = {
  scene: Scene;
  options?: AnnotationsOptions;
  activeToolType: AnnotationToolType;
  referencePoint: Cartesian3 | null;
  pointRadius: number;
};

type RenderEffectsOverlayParams = {
  focusedNodeChainAnnotationId: string | null;
  activeNodeChainAnnotationId: string | null;
  occlusionChecksEnabled: boolean;
  labelInputPromptPointId: string | null;
};

type RenderEffectsEditingParams = {
  moveGizmoPointId: string | null;
  moveGizmoOptions: Partial<{
    markerSizeScale: number;
    labelDistanceScale: number;
  }>;
  isMoveGizmoDragging: boolean;
};

type RenderEffectsCandidateParams = {
  annotationCursorEnabled: boolean;
  activeCandidateNodeECEF: Cartesian3 | null;
  cursorScreenPosition: { x: number; y: number } | null;
  activeCandidateNodeSurfaceNormalECEF: Cartesian3 | null;
  activeCandidateNodeVerticalOffsetAnchorECEF: Cartesian3 | null;
};

type RenderEffectsSelectionParams = {
  annotationSelection: AnnotationSelectionState;
  rectangleSelection: RectangleSelectionState;
};

type UseRenderEffectsParams = {
  scene: RenderEffectsSceneParams;
  overlays: RenderEffectsOverlayParams;
  editing: RenderEffectsEditingParams;
  candidate: RenderEffectsCandidateParams;
  selection: RenderEffectsSelectionParams;
};

export const useRenderEffects = (
  {
    scene: sceneParams,
    overlays,
    editing,
    candidate,
    selection,
  }: UseRenderEffectsParams,
  renderState: RenderBridgeState,
  annotationUserInteraction: UserInteractionState,
  annotationEditing: EditingState
) => {
  const { scene, options, activeToolType, referencePoint, pointRadius } =
    sceneParams;
  const {
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
    occlusionChecksEnabled,
    labelInputPromptPointId,
  } = overlays;
  const { moveGizmoPointId, moveGizmoOptions, isMoveGizmoDragging } = editing;
  const {
    annotationCursorEnabled,
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
  } = candidate;
  const { annotationSelection, rectangleSelection } = selection;

  useOverlayPositionSync(scene);

  useVisualization(
    {
      scene: {
        scene,
        focusedNodeChainAnnotationId,
        activeNodeChainAnnotationId,
      },
      geometry: {
        effectiveDistanceRelationsForRendering:
          renderState.effectiveDistanceRelationsForRendering,
        visiblePolygonAnnotationsForRendering:
          renderState.visiblePolygonAnnotationsForRendering,
        cumulativeDistanceByRelationId:
          renderState.cumulativeDistanceByRelationId,
        visiblePointEntries: renderState.visiblePointEntries,
        candidateConnectionPreview: renderState.candidateConnectionPreview,
      },
      display: {
        showPoints: renderState.showPoints,
        showPointLabels: renderState.showPointLabels,
        effectiveReferenceElevation: renderState.effectiveReferenceElevation,
        occlusionChecksEnabled,
        options,
        referencePoint,
        pointRadius,
      },
      pointLabels: {
        effectiveDistanceToReferenceByPointId:
          renderState.effectiveDistanceToReferenceByPointId,
        pointMarkerBadgeByPointId: renderState.pointMarkerBadgeByPointId,
        hiddenPointLabelIds: renderState.hiddenPointLabelIds,
        effectiveFullyHiddenPointIds: renderState.effectiveFullyHiddenPointIds,
        markerlessPointIds: renderState.markerlessPointIds,
        collapsedPillPointIds: renderState.collapsedPillPointIds,
        labelInputPromptPointId,
      },
      editing: {
        moveGizmoPointId,
        moveGizmoOptions,
        isMoveGizmoDragging,
      },
      candidate: {
        annotationCursorEnabled,
        activeCandidateNodeECEF,
        cursorScreenPosition,
        activeCandidateNodeSurfaceNormalECEF,
        activeCandidateNodeVerticalOffsetAnchorECEF,
        activeToolType,
        candidatePreviewDistanceMeters:
          renderState.candidatePreviewDistanceMeters,
      },
      selection: {
        annotationSelection,
        rectangleSelection,
      },
    },
    annotationUserInteraction,
    annotationEditing
  );
};
