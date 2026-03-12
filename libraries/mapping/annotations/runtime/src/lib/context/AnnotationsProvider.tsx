/* @refresh reset */
import React, { useMemo, useRef, useState } from "react";
import { normalizeOptions } from "@carma-commons/utils";
import {
  Cartesian3,
  Cartesian4,
  Matrix4,
  cartesian3FromJson,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
  getLocalUpDirectionAtAnchor,
  getPositionFromLocalFrame,
  getPositionInLocalFrame,
  getPositionWithVerticalOffsetFromAnchor,
  getSignedAngleDegAroundAxis,
  normalizeDirection,
  projectPointToHorizontalPlaneAtAnchor,
  resolveLocalFrameVectors,
  type Scene,
  Transforms,
} from "@carma/cesium";
import {
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  areDistanceRelationsEquivalent,
  arePolygonAnnotationsEquivalent,
  buildEdgeRelationIdsForPolygon,
  buildDerivedPolylinePaths,
  buildVerticalAutoCloseRectangle,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  getConnectedOpenPolylineGroupIds,
  getDistanceRelationId,
  getMeasurementEdgeId,
  getNextDirectLineLabelMode,
  getPointPositionMap,
  getVerticalPolygonAxisRotationSuffix,
  hasAnyVisibleDistanceRelationLine,
  type AnnotationEntry,
  type AnnotationCollection,
  type AnnotationMode,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type PolygonAreaType,
} from "@carma-mapping/annotations/core";

import { useAnnotationEntries } from "../annotation-entries/useAnnotationEntries";
import {
  syncNodeChainEdgeDistanceRelations,
  useAnnotationEntriesDomainActions,
  useAnnotationEntryNameAction,
  useAnnotationEntriesStoreState,
  useModelIntegritySync,
  usePersistenceSync,
  useSyncNodeChainEdgeRelations,
} from "../annotation-entries/useAnnotationEntries";
import {
  useActiveToolType,
  useCreateDefaults,
  useCursorCandidateState,
  useDraftActions,
  useDraftRollbackState,
  useDraftSessionState,
  useActiveDrawMode,
  type AnnotationDraftSessionState,
  useEditState,
  type AnnotationEditState,
  useModeTransition,
  useEditing,
  useInteractionLifecycle,
  useUserInteraction,
  useToolLifecycle,
  useDistanceMeasureAuthoring,
  useLabelPlacementDraftActions,
  useNodeChainFinishing,
  useNodeChainPointCreation,
  usePointCreatedHandlers,
  usePolylineSettings,
  useReferencePointMeasurementId,
} from "../interaction/useInteraction";
import {
  useRenderBridgeState,
  useRenderEffects,
  usePointIndex,
} from "../render/useRender";
import {
  useFocusActions,
  useSelectionController,
  useFocusedNodeChainAnnotationId,
  usePolygonFillSelectionHandler,
} from "../selection/useSelection";
import { useTopologyIndex } from "../annotation-entries/hooks/useTopologyIndex";
import { useNodeChainPlaneDerivation } from "../annotation-entries/hooks/useNodeChainPlaneDerivation";
import {
  defaultMoveGizmoOptions,
  defaultOptions,
  defaultPointQueryOptions,
  type AnnotationsOptions,
} from "../config/annotationsOptions";
import { useProviderSettingsState } from "./useProviderSettingsState";
import type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
} from "./annotationsContext.types";
import {
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  type AnnotationsStore,
} from "../store";
import {
  AnnotationsContext,
  AnnotationsStoreContext,
} from "../store/useAnnotationsStore";

export type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
};
export type { AnnotationsOptions } from "../config/annotationsOptions";

interface AnnotationsProviderProps {
  children: React.ReactNode;
  options?: AnnotationsOptions;
  enabled?: boolean;
  cesiumScene: Scene;
}

export const AnnotationsProvider: React.FC<AnnotationsProviderProps> = ({
  children,
  options,
  enabled = true,
  cesiumScene,
}) => {
  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const pointQueryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );
  const pointQueryEnabled = pointQueryOptions.enabled !== false;
  const moveGizmoOptions = normalizeOptions(
    options?.moveGizmo,
    defaultMoveGizmoOptions
  );
  const initialPersistenceState = normalizedOptions.initialPersistenceState;
  const onPersistenceStateChange = normalizedOptions.onPersistenceStateChange;
  const annotationsStoreRef = useRef<AnnotationsStore | null>(null);

  if (annotationsStoreRef.current === null) {
    annotationsStoreRef.current = createAnnotationsStore(
      createInitialAnnotationsStoreState({
        initialToolType: options?.initialToolType ?? "point",
        initialPointRadius: pointQueryOptions.radius,
        initialPointVerticalOffsetMeters:
          pointQueryOptions.verticalOffsetMeters,
        initialPointTemporaryMode: pointQueryOptions.temporaryMode,
        initialDistanceStickyToFirstPoint:
          options?.distance?.stickyToFirstPoint,
        initialDistanceCreationLineVisibility:
          options?.distance?.creationLineVisibility,
        initialDistanceLabelVisibilityByKind:
          options?.distance?.defaultLabelVisibilityByKind,
        initialDistanceDirectLineLabelMode:
          options?.distance?.defaultDirectLineLabelMode,
        initialPolylineVerticalOffsetMeters:
          pointQueryOptions.verticalOffsetMeters,
        initialHeightOffset: pointQueryOptions.heightOffset,
      })
    );
  }

  const annotationsStore = annotationsStoreRef.current;
  const annotationEntryState = useAnnotationEntriesStoreState(annotationsStore);
  const annotationSettingsState = useProviderSettingsState(annotationsStore);
  const annotationDraftSessionState = useDraftSessionState(annotationsStore);
  const annotationDraftRollbackState = useDraftRollbackState(annotationsStore);
  const { pointIds: selectablePointIds } = usePointIndex(
    annotationEntryState.annotations
  );
  const annotationTopologyIndex = useTopologyIndex(
    annotationEntryState.nodeChainAnnotations
  );
  const annotationEditState = useEditState(
    annotationsStore,
    annotationEntryState.annotations
  );
  const annotationCreateDefaults = useCreateDefaults(
    annotationEntryState.annotations
  );
  const referencePointMeasurementId = useReferencePointMeasurementId(
    annotationEntryState.annotations,
    annotationEntryState.referencePoint,
    0.001
  );
  const annotationSelection = useSelectionController(
    annotationsStore,
    cesiumScene,
    selectablePointIds
  );
  const focusedSelectedNodeChainAnnotationId = useFocusedNodeChainAnnotationId(
    annotationSelection.selectedAnnotationId,
    annotationSelection.selectedAnnotationIds,
    annotationTopologyIndex.getOwnerGroupIdsForPointId,
    annotationDraftSessionState.activeNodeChainAnnotationId
  );
  const annotationSelectionState = {
    ...annotationSelection,
    focusedNodeChainAnnotationId: focusedSelectedNodeChainAnnotationId,
  };
  const scene = cesiumScene;
  const {
    getPreferredPlaneFacingPosition,
    orientPlaneTowardSceneCamera,
    computePolygonGroupDerivedDataWithCamera,
  } = useNodeChainPlaneDerivation(scene);
  const isInteractionActive = enabled;
  const {
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    referencePoint,
    annotationToolType,
    showLabels,
    occlusionChecksEnabled,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setReferencePoint,
  } = annotationEntryState;
  const updateAnnotationEntryNameById =
    useAnnotationEntryNameAction(setAnnotations);
  const {
    pointRadius,
    pointVerticalOffsetMeters,
    pointTemporaryMode,
    defaultPolylineVerticalOffsetMeters,
    defaultPolylineSegmentLineMode,
    distanceModeStickyToFirstPoint,
    distanceCreationLineVisibility,
    distanceDefaultLabelVisibilityByKind,
    distanceDefaultDirectLineLabelMode,
    heightOffset,
    setPointVerticalOffsetMeters,
    setPointTemporaryMode,
    setDefaultPolylineVerticalOffsetMeters,
    setDefaultPolylineSegmentLineMode,
    setDistanceModeStickyToFirstPoint,
    setDistanceCreationLineVisibilityByKind,
  } = annotationSettingsState;
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<AnnotationMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<Set<AnnotationMode>>(
    new Set()
  );
  const {
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    pruneMeasurementDraftSession,
  } = annotationDraftRollbackState;
  const {
    activeNodeChainAnnotationId,
    labelInputPromptPointId,
    distanceSession,
    setActiveNodeChainAnnotationId,
    setLabelInputPromptPointId,
    clearDistanceSession,
    pruneDistanceSession,
  } = annotationDraftSessionState;
  const {
    selectedAnnotationId,
    selectedAnnotationIds,
    selectionModeActive,
    setSelectionModeActive,
    selectAnnotationById,
    selectAnnotationByIdImmediate,
    clearPointSelection,
    clearAnnotationSelection,
    pruneSelectionByRemovedIds,
    focusedNodeChainAnnotationId,
  } = annotationSelectionState;
  const {
    getOwnerGroupIdsForPointId,
    getOwnerGroupIdsForEdgeRelationId,
    getRepresentativePointIdForGroupId,
  } = annotationTopologyIndex;

  const { moveGizmo, clearMoveGizmo } = annotationEditState;

  useModelIntegritySync({
    annotations,
    defaultPolylineSegmentLineMode,
    setDistanceRelations,
    setNodeChainAnnotations,
    computePolygonGroupDerivedDataWithCamera,
  });

  usePersistenceSync({
    initialPersistenceState,
    onPersistenceStateChange,
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
  });

  const {
    polylineVerticalOffsetMeters,
    setPolylineVerticalOffsetMeters,
    polylineSegmentLineMode,
    setPolylineSegmentLineMode,
  } = usePolylineSettings({
    focusedNodeChainAnnotationId,
    nodeChainAnnotations,
    defaultPolylineVerticalOffsetMeters,
    defaultPolylineSegmentLineMode,
    setDefaultPolylineVerticalOffsetMeters,
    setDefaultPolylineSegmentLineMode,
    setNodeChainAnnotations,
    setAnnotations,
  });
  const activeToolType = useActiveToolType(
    annotationToolType,
    selectionModeActive
  );

  const {
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    clearAnnotationCursor,
    handleAnnotationCursorMove,
    isPolylineCandidateMode,
    hasCandidateNode,
    candidateSupportsEdgeLine,
    candidateUsesPolylineEdgeRules,
    candidateForcesDirectEdgeLine,
    annotationCursorEnabled,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
  } = useCursorCandidateState({
    scene,
    annotations,
    activeToolType,
    activeNodeChainAnnotationId,
    labelInputPromptPointId,
    nodeChainAnnotations,
    pointVerticalOffsetMeters,
    polylineVerticalOffsetMeters,
    pointQueryEnabled,
    moveGizmoPointId: moveGizmo.pointId,
    isMoveGizmoDragging: moveGizmo.isDragging,
    setNodeChainAnnotations,
  });
  const { lastCustomPointAnnotationName } = annotationCreateDefaults;

  const {
    clearPendingLabelPlacementAnnotation,
    clearActiveNodeChainDrawingState,
    discardActiveMeasurementDraft,
  } = useDraftActions({
    annotationsStore,
    moveGizmoPointId: moveGizmo.pointId,
    distanceSession,
    setActiveNodeChainAnnotationId,
    setLabelInputPromptPointId,
    setNodeChainAnnotations,
    setDistanceRelations,
    setAnnotations,
    pruneSelectionByRemovedIds,
    clearMeasurementDraftSession,
    clearDistanceSession,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearMoveGizmo,
  });

  const { selectRepresentativeNodeForMeasurementId, focusAnnotationById } =
    useFocusActions({
      nodeChainAnnotations,
      getRepresentativePointIdForGroupId,
      clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      clearAnnotationSelection,
      selectAnnotationById,
    });

  const isActiveDrawMode = useActiveDrawMode(
    activeNodeChainAnnotationId,
    nodeChainAnnotations
  );

  const {
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
  } = useDistanceMeasureAuthoring({
    scene: cesiumScene,
    annotations: annotationEntryState.annotations,
    defaults: {
      defaultDistanceRelationLabelVisibility:
        distanceDefaultLabelVisibilityByKind,
      defaultDirectLineLabelMode: distanceDefaultDirectLineLabelMode,
    },
    session: {
      activeNodeChainAnnotationId,
      focusedNodeChainAnnotationId,
      nodeChainAnnotations,
    },
    selection: {
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
    },
    topology: {
      getOwnerGroupIdsForEdgeRelationId:
        annotationTopologyIndex.getOwnerGroupIdsForEdgeRelationId,
    },
    mutation: {
      setDistanceRelations,
      setAnnotations,
      setNodeChainAnnotations,
      setActiveNodeChainAnnotationId,
    },
  });

  const {
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    collapsedPillPointIds,
    visiblePointEntries,
    showPoints,
    showPointLabels,
    lockedAnnotationIdSet,
    markerlessPointIds,
    visiblePolygonAnnotationsForRendering,
    effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
    currentAnnotationId,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
  } = useRenderBridgeState({
    scene,
    data: {
      annotations,
      distanceRelations,
      nodeChainAnnotations,
      referencePoint,
      defaultPolylineVerticalOffsetMeters,
      setAnnotations,
    },
    display: {
      hideMeasurementsOfType,
      hideLabelsOfType,
      showLabels,
      annotationCursorEnabled,
    },
    selection: {
      selectedAnnotationId,
      selectedAnnotationIds,
      focusedNodeChainAnnotationId,
      activeNodeChainAnnotationId,
    },
    candidate: {
      session: {
        annotationsStore,
        referencePointMeasurementId,
        selectablePointIds,
        activeNodeChainAnnotationId,
        nodeChainAnnotations,
      },
      pointer: {
        activeCandidateNodeECEF,
        candidateSupportsEdgeLine,
      },
      preview: {
        candidateForcesDirectEdgeLine,
        candidateUsesPolylineEdgeRules,
        polylineSegmentLineMode,
        distanceCreationLineVisibility,
        isPolylineCandidateMode,
      },
    },
  });

  const {
    finishActivePolygonMeasurement,
    finishActivePolylineMeasurement,
    handlePointQueryDoubleClick,
  } = useNodeChainFinishing({
    sceneCameraPosition: getPreferredPlaneFacingPosition(),
    activeToolType,
    activeNodeChainAnnotationId,
    annotations,
    nodeChainAnnotations: nodeChainAnnotations,
    setNodeChainAnnotations,
    clearAnnotationCursor,
    clearActiveNodeChainDrawingState,
    selectRepresentativeNodeForMeasurementId,
    discardActiveMeasurementDraft,
  });

  usePolygonFillSelectionHandler({
    scene,
    selectionModeActive,
    clearSelection: () => selectAnnotationById(null),
    selectByPolygonGroupId: selectRepresentativeNodeForMeasurementId,
  });

  const { handlePointAnnotationCreated, handleLabelAnnotationCreated } =
    usePointCreatedHandlers({
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setLabelInputPromptPointId,
    });

  const { requestEnterToolType, clearSharedModeExitState } = useModeTransition({
    annotationsStore,
    setSelectionModeActive,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearActiveNodeChainDrawingState: clearActiveNodeChainDrawingState,
    clearMoveGizmo,
    clearPendingLabelPlacementAnnotation,
  });

  const {
    updatePointLabelAppearanceById,
    updateNodeChainAnnotationNameById,
    updateNodeChainAnnotationSegmentLineModeById,
    updateAnnotationNameById,
    updateAnnotationVisualizerOptionsById,
    toggleNodeChainAnnotationVisibilityById,
    toggleAnnotationsVisibilityByIds,
    toggleNodeChainAnnotationLockById,
    toggleAnnotationsLockByIds,
    cyclePointLabelMetricModeByMeasurementId,
    clearAllAnnotations,
    clearAnnotationsByType,
    clearAnnotationsByIds,
    deletePolygonAnnotationById,
    deleteAnnotationsByIds,
    deleteSelectedAnnotations,
  } = useAnnotationEntriesDomainActions({
    annotations,
    distanceRelations,
    nodeChainAnnotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    selectablePointIds,
    lockedAnnotationIdSet,
    moveGizmoPointId: moveGizmo.pointId,
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setActiveNodeChainAnnotationId,
    clearAnnotationSelection,
    clearPointSelection,
    clearActiveNodeChainDrawingState,
    clearMoveGizmo,
    getOwnerGroupIdsForPointId,
    computePolygonGroupDerivedDataWithCamera,
    pruneDistanceSession,
    pruneMeasurementDraftSession,
    pruneSelectionByRemovedIds,
    updateAnnotationEntryNameById,
  });

  useSyncNodeChainEdgeRelations({
    setDistanceRelations,
    nodeChainAnnotations,
    defaultPolylineSegmentLineMode,
    defaultDistanceRelationLabelVisibility:
      distanceDefaultLabelVisibilityByKind,
    defaultDirectLineLabelMode: distanceDefaultDirectLineLabelMode,
  });

  const { requestFinishLabelPlacementDraft, requestCancelLabelPlacementDraft } =
    useLabelPlacementDraftActions({
      labelInputPromptPointId,
      setLabelInputPromptPointId,
      clearAnnotationsByIds,
    });

  const { handleNodeChainPointCreated, insertExistingNodeIntoActiveChain } =
    useNodeChainPointCreation({
      annotationsStore,
      activeToolType,
      defaultPolylineSegmentLineMode,
      defaultDistanceLineVisibility: distanceCreationLineVisibility,
      polylineVerticalOffsetMeters,
      setNodeChainAnnotations,
      setAnnotations,
      setActiveNodeChainAnnotationId,
      trackMeasurementDraftPointIds,
      clearActiveNodeChainDrawingState: clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
    });
  const {
    activeToolSession,
    contextValue: toolsContextValue,
    confirmLabelPlacementById,
    handlePointQueryPointCreated,
    requestFinishMeasurement,
    requestStartMeasurement,
  } = useToolLifecycle({
    activeToolType,
    annotations,
    setAnnotations,
    clearAnnotationsByIds,
    labelInputPromptPointId,
    requestEnterToolType,
    requestFinishLabelPlacementDraft,
    requestCancelLabelPlacementDraft,
    handlePointAnnotationCreated,
    handleLabelAnnotationCreated,
    activeNodeChainAnnotationId,
    nodeChainAnnotations,
    discardActiveMeasurementDraft,
    finishActivePolylineMeasurement,
    finishActivePolygonMeasurement,
    handleNodeChainPointCreated,
    clearSharedModeExitState,
    setLabelInputPromptPointId,
  });

  const annotationEditing = useEditing({
    annotationsStore,
    currentAnnotationId,
    scene: cesiumScene,
    annotations: annotationEntryState.annotations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    referencePoint: annotationEntryState.referencePoint,
    selectedAnnotationIds: annotationSelectionState.selectedAnnotationIds,
    focusedNodeChainAnnotationId: focusedNodeChainAnnotationId,
    pointRadius: annotationSettingsState.pointRadius,
    setAnnotations: annotationEntryState.setAnnotations,
    setNodeChainAnnotations: annotationEntryState.setNodeChainAnnotations,
    setReferencePoint: annotationEntryState.setReferencePoint,
    selectAnnotationById: annotationSelectionState.selectAnnotationById,
    handleDistanceRelationLineClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationCornerClick,
    handleDistanceRelationMidpointClick,
  });
  const annotationCollectionDomain = useAnnotationEntries({
    scene: cesiumScene,
    annotations: annotationEntryState.annotations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    referencePoint: annotationEntryState.referencePoint,
    setAnnotations: annotationEntryState.setAnnotations,
    setReferencePoint: annotationEntryState.setReferencePoint,
    referencePointSyncEpsilonMeters: 0.001,
    updateAnnotationNameById,
    updateAnnotationVisualizerOptionsById,
    updatePointLabelAppearanceById,
    deleteAnnotationsByIds,
    deleteSelectedAnnotations,
    clearAllAnnotations,
    clearAnnotationsByType,
    toggleAnnotationsLockByIds,
    toggleAnnotationsVisibilityByIds,
    confirmLabelPlacementById,
    focusAnnotationById,
  });

  const annotationUserInteraction = useUserInteraction(
    {
      annotations: annotationEntryState.annotations,
      activeToolType: activeToolType,
      selectionModeActive: annotationSelectionState.selectionModeActive,
      effectiveSelectModeAdditive:
        annotationSelectionState.effectiveSelectModeAdditive,
      selectablePointIds,
      moveGizmoPointId: annotationEditing.moveGizmoPointId,
      isMoveGizmoDragging: annotationEditing.isMoveGizmoDragging,
      pointQueryEnabled: pointQueryEnabled,
      hasCandidateNode: hasCandidateNode,
      isActiveDrawMode: isActiveDrawMode,
      activeNodeChainAnnotationId:
        annotationDraftSessionState.activeNodeChainAnnotationId,
      nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
      selectAnnotationIds: annotationSelectionState.selectAnnotationIds,
      selectAnnotationById: annotationSelectionState.selectAnnotationById,
      syncAnnotationCursorToExistingPoint: syncAnnotationCursorToExistingPoint,
      releaseAnnotationCursorSnap: releaseAnnotationCursorSnap,
      scheduleAnnotationCursorSnapRelease: scheduleAnnotationCursorSnapRelease,
      insertExistingNodeIntoActiveChain: insertExistingNodeIntoActiveChain,
      finishesOnLoopClosure: activeToolSession?.finishesOnLoopClosure ?? false,
      requestFinishMeasurement,
      selectedAnnotationId: annotationSelectionState.selectedAnnotationId,
      cyclePointLabelMetricModeByMeasurementId:
        cyclePointLabelMetricModeByMeasurementId,
      labelInputPromptPointId: labelInputPromptPointId,
      setLabelInputPromptPointId: setLabelInputPromptPointId,
      setReferencePointId: annotationCollectionDomain.setReferencePointId,
      pointTemporaryMode: pointTemporaryMode,
      pointVerticalOffsetMeters: pointVerticalOffsetMeters,
      lastCustomPointAnnotationName: lastCustomPointAnnotationName,
      isPolylineCandidateMode: isPolylineCandidateMode,
      polylineVerticalOffsetMeters: polylineVerticalOffsetMeters,
      scene: cesiumScene,
      setAnnotations: annotationEntryState.setAnnotations,
      handlePointQueryPointCreated: handlePointQueryPointCreated,
      handlePointQueryDoubleClick: handlePointQueryDoubleClick,
      hasFocusedSelection: focusedNodeChainAnnotationId !== null,
      clearFocusedSelection: () =>
        selectRepresentativeNodeForMeasurementId(null),
      selectByPolygonGroupId: selectRepresentativeNodeForMeasurementId,
      handleAnnotationCursorMove: handleAnnotationCursorMove,
    },
    annotationEditing
  );
  useInteractionLifecycle({
    annotations: annotationEntryState.annotations,
    selectedAnnotationIds: annotationSelectionState.selectedAnnotationIds,
    selectablePointIds,
    lockedAnnotationIdSet: lockedAnnotationIdSet,
    selectedAnnotationId: annotationSelectionState.selectedAnnotationId,
    deleteSelectedAnnotations: deleteSelectedAnnotations,
    clearAnnotationsByIds: clearAnnotationsByIds,
    selectAnnotationById: annotationSelectionState.selectAnnotationById,
    setAnnotations: annotationEntryState.setAnnotations,
    pointTemporaryMode: pointTemporaryMode,
    activeToolType: activeToolType,
    requestStartMeasurement: requestStartMeasurement,
    requestFinishMeasurement,
    isInteractionActive: isInteractionActive,
    distanceRelations: annotationEntryState.distanceRelations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    activeNodeChainAnnotationId:
      annotationDraftSessionState.activeNodeChainAnnotationId,
    setActiveNodeChainAnnotationId:
      annotationDraftSessionState.setActiveNodeChainAnnotationId,
    setNodeChainAnnotations: annotationEntryState.setNodeChainAnnotations,
    isPointMeasureCreateModeActive:
      annotationUserInteraction.isPointMeasureCreateModeActive,
  });
  useRenderEffects(
    {
      scene: {
        scene: cesiumScene,
        options,
        activeToolType: activeToolType,
        referencePoint: annotationEntryState.referencePoint,
        pointRadius: annotationSettingsState.pointRadius,
      },
      overlays: {
        focusedNodeChainAnnotationId: focusedNodeChainAnnotationId,
        activeNodeChainAnnotationId:
          annotationDraftSessionState.activeNodeChainAnnotationId,
        occlusionChecksEnabled: occlusionChecksEnabled,
        labelInputPromptPointId: labelInputPromptPointId,
      },
      editing: {
        moveGizmoPointId: annotationEditing.moveGizmoPointId,
        moveGizmoOptions: moveGizmoOptions,
        isMoveGizmoDragging: annotationEditing.isMoveGizmoDragging,
      },
      candidate: {
        annotationCursorEnabled: annotationCursorEnabled,
        activeCandidateNodeECEF: activeCandidateNodeECEF,
        cursorScreenPosition: cursorScreenPosition,
        activeCandidateNodeSurfaceNormalECEF:
          activeCandidateNodeSurfaceNormalECEF,
        activeCandidateNodeVerticalOffsetAnchorECEF:
          activeCandidateNodeVerticalOffsetAnchorECEF,
      },
      selection: {
        annotationSelection: annotationSelectionState.annotationSelection,
        rectangleSelection: annotationSelectionState.rectangleSelection,
      },
    },
    {
      cumulativeDistanceByRelationId,
      effectiveReferenceElevation,
      effectiveDistanceToReferenceByPointId,
      pointMarkerBadgeByPointId,
      collapsedPillPointIds,
      visiblePointEntries,
      showPoints,
      showPointLabels,
      lockedAnnotationIdSet,
      markerlessPointIds,
      visiblePolygonAnnotationsForRendering,
      effectiveDistanceRelationsForRendering,
      hiddenPointLabelIds,
      effectiveFullyHiddenPointIds,
      currentAnnotationId,
      candidateConnectionPreview,
      candidatePreviewDistanceMeters,
    },
    annotationUserInteraction,
    annotationEditing
  );

  const selectionContextValue = useMemo<AnnotationSelectionContextType>(
    () => ({
      ids: annotationSelectionState.selectedAnnotationIds,
      mode: {
        active: annotationSelectionState.selectionModeActive,
        additive: annotationSelectionState.selectModeAdditive,
        rectangle: annotationSelectionState.selectModeRectangle,
      },
      setModeActive: annotationSelectionState.setSelectionModeActive,
      setAdditiveMode: annotationSelectionState.setSelectModeAdditive,
      setRectangleMode: annotationSelectionState.setSelectModeRectangle,
      set: annotationSelectionState.selectAnnotationIds,
      clear: annotationSelectionState.clearAnnotationSelection,
    }),
    [
      annotationSelectionState.clearAnnotationSelection,
      annotationSelectionState.selectAnnotationIds,
      annotationSelectionState.selectModeAdditive,
      annotationSelectionState.selectModeRectangle,
      annotationSelectionState.selectedAnnotationIds,
      annotationSelectionState.selectionModeActive,
      annotationSelectionState.setSelectionModeActive,
      annotationSelectionState.setSelectModeAdditive,
      annotationSelectionState.setSelectModeRectangle,
    ]
  );

  const annotationsContextValue = useMemo<AnnotationsContextType>(
    () => ({
      tools: toolsContextValue,
      selection: selectionContextValue,
      annotations: annotationCollectionDomain.contextValue,
      edit: annotationEditing.contextValue,
      settings: annotationSettingsState.contextValue,
    }),
    [
      annotationCollectionDomain.contextValue,
      annotationEditing.contextValue,
      annotationSettingsState.contextValue,
      selectionContextValue,
      toolsContextValue,
    ]
  );

  return (
    <AnnotationsContext.Provider value={annotationsContextValue}>
      <AnnotationsStoreContext.Provider value={annotationsStore}>
        {children}
      </AnnotationsStoreContext.Provider>
    </AnnotationsContext.Provider>
  );
};
