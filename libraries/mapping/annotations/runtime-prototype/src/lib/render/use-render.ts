import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  AnnotationCollection,
  AnnotationMode,
  AnnotationToolType,
  NodeChainAnnotation,
  PointDistanceRelation,
  isPointMeasurementEntry,
  ANNOTATION_TOOL_TYPES,
} from "@carma-mapping/annotations/core";
import type { Cartesian3, Scene } from "@carma-cesium";
import type { AnnotationsOptions } from "../config/annotations-options";
import type { EditingState } from "../interaction/editing/use-editing";
import type { UserInteractionState } from "../interaction/lifecycle/modes/use-user-interaction";
import type { RectangleSelectionState } from "../selection/hooks/use-rectangle-selection-overlay";
import type { AnnotationSelectionState } from "../selection/types/annotation-selection.types";
import { useStoreSelector, type AnnotationsStore } from "../store";
import {
  isPointVisibleForRendering,
  useClosedAreaBridge,
  usePointBridge,
  usePolylineBridge,
  useVisibilityBridge,
} from "./bridge";
import { usePointIndex } from "./point/use-point-index";
import { useVisualization } from "./scene/use-visualization";
const {
  DISTANCE: ANNOTATION_TYPE_DISTANCE,
  POINT: ANNOTATION_TYPE_POINT,
  SELECT: SELECT_TOOL_TYPE,
} = ANNOTATION_TOOL_TYPES;

export {
  usePointMarkerBadges,
  type AnnotationPointMarkerBadge,
} from "./point/use-point-marker-badges";
export { usePointIndex } from "./point/use-point-index";

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
  candidateSupportsEdgeLine: boolean;
};

type RenderBridgeCandidateParams = {
  session: RenderBridgeCandidateSessionParams;
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
  const { session: candidateSession } = candidate;
  const activeToolType = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.annotationToolType
  );
  const labelInputPromptPointId = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const distanceModeStickyToFirstPoint = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.settingsState.distance.stickyToFirstPoint
  );
  const currentSelectedAnnotationId = useStoreSelector(
    candidateSession.annotationsStore,
    (state) =>
      state.selectionState.selectedAnnotationIds[
        state.selectionState.selectedAnnotationIds.length - 1
      ] ?? null
  );
  const moveGizmoPointId = useStoreSelector(
    candidateSession.annotationsStore,
    (state) => state.editState.moveGizmo.pointId
  );
  const showAllPointOverlays =
    activeToolType === SELECT_TOOL_TYPE || labelInputPromptPointId !== null;
  const openChainPointId = useMemo(() => {
    if (!candidateSession.activeNodeChainAnnotationId) {
      return null;
    }

    const activeOpenAnnotation =
      candidateSession.nodeChainAnnotations.find(
        (annotation) =>
          annotation.id === candidateSession.activeNodeChainAnnotationId &&
          !annotation.closed
      ) ?? null;

    return (
      activeOpenAnnotation?.nodeIds[activeOpenAnnotation.nodeIds.length - 1] ??
      null
    );
  }, [
    candidateSession.activeNodeChainAnnotationId,
    candidateSession.nodeChainAnnotations,
  ]);
  const currentAnnotationId = useMemo(() => {
    if (
      moveGizmoPointId &&
      candidateSession.selectablePointIds.has(moveGizmoPointId)
    ) {
      return moveGizmoPointId;
    }

    const candidateAnchorPointId = candidateSession.candidateSupportsEdgeLine
      ? activeToolType === ANNOTATION_TYPE_DISTANCE &&
        distanceModeStickyToFirstPoint &&
        candidateSession.referencePointMeasurementId
        ? candidateSession.referencePointMeasurementId
        : openChainPointId &&
          candidateSession.selectablePointIds.has(openChainPointId)
        ? openChainPointId
        : null
      : null;

    if (candidateAnchorPointId) {
      return candidateAnchorPointId;
    }

    if (
      openChainPointId &&
      candidateSession.selectablePointIds.has(openChainPointId)
    ) {
      return openChainPointId;
    }

    if (
      currentSelectedAnnotationId &&
      candidateSession.selectablePointIds.has(currentSelectedAnnotationId)
    ) {
      return currentSelectedAnnotationId;
    }

    return null;
  }, [
    activeToolType,
    candidateSession.candidateSupportsEdgeLine,
    candidateSession.referencePointMeasurementId,
    candidateSession.selectablePointIds,
    distanceModeStickyToFirstPoint,
    moveGizmoPointId,
    openChainPointId,
    currentSelectedAnnotationId,
  ]);
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

  return {
    cumulativeDistanceByRelationId:
      polylineBridge.cumulativeDistanceByRelationId,
    effectiveReferenceElevation: polylineBridge.effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId:
      polylineBridge.effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId: pointBridge.pointMarkerBadgeByPointId,
    polylinePointLabelTextByPointId:
      pointBridge.polylinePointLabelTextByPointId,
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
    currentAnnotationId,
    focusedPolylineDistanceToStartByPointId:
      polylineBridge.focusedPolylineDistanceToStartByPointId,
  };
};

export type RenderBridgeState = ReturnType<typeof useRenderBridgeState>;

type RenderEffectsSceneParams = {
  scene: Scene;
  options?: AnnotationsOptions;
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
  const { scene, options } = sceneParams;
  const {
    focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId,
    occlusionChecksEnabled,
    labelInputPromptPointId,
  } = overlays;
  const { moveGizmoPointId, moveGizmoOptions, isMoveGizmoDragging } = editing;
  const { annotationCursorEnabled } = candidate;
  const { annotationSelection, rectangleSelection } = selection;
  const staticVisiblePolygonAnnotationsForRendering = useMemo(
    () =>
      annotationCursorEnabled && activeNodeChainAnnotationId
        ? renderState.visiblePolygonAnnotationsForRendering.filter(
            (annotation) => annotation.id !== activeNodeChainAnnotationId
          )
        : renderState.visiblePolygonAnnotationsForRendering,
    [
      activeNodeChainAnnotationId,
      annotationCursorEnabled,
      renderState.visiblePolygonAnnotationsForRendering,
    ]
  );
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
          staticVisiblePolygonAnnotationsForRendering,
        cumulativeDistanceByRelationId:
          renderState.cumulativeDistanceByRelationId,
        visiblePointEntries: renderState.visiblePointEntries,
      },
      display: {
        showPoints: renderState.showPoints,
        showPointLabels: renderState.showPointLabels,
        effectiveReferenceElevation: renderState.effectiveReferenceElevation,
        occlusionChecksEnabled,
        options,
      },
      pointLabels: {
        effectiveDistanceToReferenceByPointId:
          renderState.effectiveDistanceToReferenceByPointId,
        pointMarkerBadgeByPointId: renderState.pointMarkerBadgeByPointId,
        polylinePointLabelTextByPointId:
          renderState.polylinePointLabelTextByPointId,
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
