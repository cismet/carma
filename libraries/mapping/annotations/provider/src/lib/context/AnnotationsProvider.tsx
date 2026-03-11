/* @refresh reset */
import React, {
  createContext,
  useContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
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
import { useStoreSelector } from "@carma-commons/react-store";
import { normalizeOptions } from "@carma-commons/utils";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
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
  type AnnotationPersistenceEnvelopeV2,
  type AnnotationToolType,
  type DirectLineLabelMode,
  type DistanceRelationLabelVisibilityByKind,
  type DerivedPolylinePath,
  isPointAnnotationEntry,
  isAreaToolType,
  type LinearSegmentLineMode,
  type NodeChainAnnotation,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  projectPointOntoPlane,
  type PolygonAreaType,
  type ReferenceLineLabelKind,
} from "@carma-mapping/annotations/core";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";

import { useAnnotationCollectionDomain } from "./annotation-entries/useAnnotationCollectionDomain";
import { useAnnotationEntriesDomainActions } from "./annotation-entries/useAnnotationEntriesDomainActions";
import { useAnnotationEntryStoreState } from "./annotation-entries/useAnnotationEntryStoreState";
import { useAnnotationEntryNameAction } from "./annotation-entries/useAnnotationEntryNameAction";
import { useAnnotationModelIntegritySync } from "./annotation-entries/useAnnotationModelIntegritySync";
import { useAnnotationPersistenceSync } from "./annotation-entries/useAnnotationPersistenceSync";
import { useSyncNodeChainEdgeRelations } from "./annotation-entries/useSyncNodeChainEdgeRelations";
import { syncNodeChainEdgeDistanceRelations } from "./annotation-entries/syncNodeChainEdgeDistanceRelations";
import { useAnnotationsEditing } from "./interaction/editing/useAnnotationsEditing";
import type { AnnotationEditState } from "./interaction/editing/useAnnotationEditState";
import { useAnnotationDraftSessionState } from "./interaction/mode-lifecycle/useAnnotationDraftSessionState";
import type { AnnotationDraftSessionState } from "./interaction/mode-lifecycle/useAnnotationDraftSessionState";
import { useActiveToolType } from "./interaction/mode-lifecycle/useActiveToolType";
import { useAnnotationDraftActions } from "./interaction/mode-lifecycle/useAnnotationDraftActions";
import { useAnnotationModeTransition } from "./interaction/mode-lifecycle/useAnnotationModeTransition";
import { useAnnotationToolLifecycle } from "./interaction/mode-lifecycle/useAnnotationToolLifecycle";
import { useDistanceMeasureAuthoring } from "./interaction/mode-lifecycle/useDistanceMeasureAuthoring";
import { useLabelPlacementDraftActions } from "./interaction/mode-lifecycle/useLabelPlacementDraftActions";
import { useNodeChainFinishing } from "./interaction/mode-lifecycle/useNodeChainFinishing";
import { useAnnotationsUserInteraction } from "./interaction/useAnnotationsUserInteraction";
import { useActiveDrawModeState } from "./interaction/useActiveDrawModeState";
import { useAnnotationsInteractionLifecycle } from "./interaction/useAnnotationsInteractionLifecycle";
import { useOverlayPositionSync } from "./interaction/useOverlayPositionSync";
import { usePointQuerySelectionGuard } from "./interaction/usePointQuerySelectionGuard";
import { usePointAnnotationCreatedHandlers } from "./interaction/create/usePointAnnotationCreatedHandlers";
import { useNodeChainPointCreation } from "./interaction/create/useNodeChainPointCreation";
import { useAnnotationCursorCandidateState } from "./interaction/candidate/useAnnotationCursorCandidateState";
import { useCandidatePreviewAnnotation } from "./interaction/candidate/useCandidatePreviewAnnotation";
import { useAnnotationsVisualization } from "./render/useAnnotationsVisualization";
import { useAnnotationsVisualizationState } from "./render/useAnnotationsVisualizationState";
import { useAnnotationVisibilityFilterState } from "./render/useAnnotationVisibilityFilterState";
import { useAnnotationsSelectionState } from "./selection";
import type { AnnotationsSelectionState } from "./selection";
import { usePointMeasurementCollections } from "./topology/point/usePointMeasurementCollections";
import type { PointMeasurementCollections } from "./topology/point/usePointMeasurementCollections";
import { usePolylineMeasureState } from "./topology/polyline/usePolylineMeasureState";
import { useAnnotationTopologyIndex } from "./topology/useAnnotationTopologyIndex";
import type { MeasurementOwnershipIndex } from "./topology/useAnnotationTopologyIndex";
import { useNodeChainPlaneDerivation } from "./topology/useNodeChainPlaneDerivation";
import { useAnnotationSettingsState } from "./interaction/settings/useAnnotationSettingsState";
import type { AnnotationSettingsState } from "./interaction/settings/useAnnotationSettingsState";
import { useAnnotationDraftRollbackState } from "./interaction/mode-lifecycle/useAnnotationDraftRollbackState";
import type { MeasurementDraftRollbackState } from "./interaction/mode-lifecycle/useAnnotationDraftRollbackState";
import { useAnnotationEditState } from "./interaction/editing/useAnnotationEditState";
import { useAnnotationCreateDefaults } from "./interaction/create/useAnnotationCreateDefaults";
import type { AnnotationCreateDefaults } from "./interaction/create/useAnnotationCreateDefaults";
import { useReferencePointMeasurementId } from "./interaction/useReferencePointMeasurementId";
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
  type AnnotationsStoreSnapshot,
} from "./store";
import type { AnnotationEntryStoreState } from "./annotation-entries/useAnnotationEntryStoreState";

export type {
  AnnotationsContextType,
  AnnotationCollectionContextType,
  AnnotationEditingContextType,
  AnnotationSelectionContextType,
  AnnotationSettingsContextType,
  AnnotationToolsContextType,
};

interface AnnotationsProviderProps {
  children: React.ReactNode;
  options?: AnnotationsOptions;
  enabled?: boolean;
  cesiumScene: Scene;
}

const AnnotationsStoreContext = createContext<AnnotationsStore | undefined>(
  undefined
);

const useRequiredAnnotationsStore = (
  store: AnnotationsStore | undefined,
  hookName: string
): AnnotationsStore => {
  if (store === undefined) {
    throw new Error(`${hookName} must be used within a AnnotationsProvider`);
  }

  return store;
};

export const AnnotationsProvider: React.FC<AnnotationsProviderProps> = ({
  children,
  options,
  enabled = true,
  cesiumScene,
}) => {
  const annotationsStoreRef = useRef<AnnotationsStore | null>(null);

  if (annotationsStoreRef.current === null) {
    annotationsStoreRef.current = createAnnotationsStore(
      createInitialAnnotationsStoreState({
        initialToolType: options?.initialToolType ?? "point",
        initialPointRadius: options?.pointQueries?.radius ?? 1,
        initialPointVerticalOffsetMeters:
          options?.pointQueries?.verticalOffsetMeters ?? 0,
        initialPointTemporaryMode:
          options?.pointQueries?.temporaryMode ?? false,
        initialDistanceStickyToFirstPoint:
          options?.distance?.stickyToFirstPoint,
        initialDistanceCreationLineVisibility:
          options?.distance?.creationLineVisibility,
        initialDistanceLabelVisibilityByKind:
          options?.distance?.defaultLabelVisibilityByKind,
        initialDistanceDirectLineLabelMode:
          options?.distance?.defaultDirectLineLabelMode,
        initialPolylineVerticalOffsetMeters:
          options?.pointQueries?.verticalOffsetMeters ?? 0,
        initialHeightOffset: options?.pointQueries?.heightOffset ?? 1.5,
      })
    );
  }

  const annotationsStore = annotationsStoreRef.current;
  const annotationEntryState = useAnnotationEntryStoreState(annotationsStore);
  const annotationSettingsState = useAnnotationSettingsState(annotationsStore);
  const annotationDraftSessionState =
    useAnnotationDraftSessionState(annotationsStore);
  const annotationDraftRollbackState =
    useAnnotationDraftRollbackState(annotationsStore);
  const pointMeasurementCollections = usePointMeasurementCollections(
    annotationEntryState.annotations
  );
  const annotationTopologyIndex = useAnnotationTopologyIndex(
    annotationEntryState.nodeChainAnnotations
  );
  const annotationEditState = useAnnotationEditState(
    annotationsStore,
    annotationEntryState.annotations
  );
  const annotationCreateDefaults = useAnnotationCreateDefaults(
    annotationEntryState.annotations
  );
  const referencePointMeasurementId = useReferencePointMeasurementId(
    annotationEntryState.annotations,
    annotationEntryState.referencePoint,
    0.001
  );
  const annotationSelectionState = useAnnotationsSelectionState(
    annotationsStore,
    cesiumScene,
    pointMeasurementCollections.selectablePointIds,
    annotationTopologyIndex.getOwnerGroupIdsForPointId,
    annotationDraftSessionState.activeNodeChainAnnotationId
  );
  const scene = cesiumScene;
  const selectionState = annotationSelectionState;
  const {
    getPreferredPlaneFacingPosition,
    orientPlaneTowardSceneCamera,
    computePolygonGroupDerivedDataWithCamera,
  } = useNodeChainPlaneDerivation(scene);
  useOverlayPositionSync(scene);

  const pointQueryOptions = normalizeOptions(
    options?.pointQueries,
    defaultPointQueryOptions
  );
  const pointQueryEnabled = pointQueryOptions.enabled !== false;

  const moveGizmoOptions = normalizeOptions(
    options?.moveGizmo,
    defaultMoveGizmoOptions
  );

  const normalizedOptions = normalizeOptions(options, defaultOptions);
  const { initialPersistenceState, onPersistenceStateChange } =
    normalizedOptions;
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
  const {
    hideAnnotationsOfType: hideMeasurementsOfType,
    setHideAnnotationsOfType: setHideMeasurementsOfType,
    hideLabelsOfType,
    setHideLabelsOfType,
  } = useAnnotationVisibilityFilterState();
  const {
    createdPointIds,
    createdRelationIds,
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    trackMeasurementDraftRelationId,
    pruneMeasurementDraftSession,
  } = annotationDraftRollbackState;
  const {
    activeNodeChainAnnotationId,
    pendingPolylinePromotionRingClosurePointId,
    labelInputPromptPointId,
    doubleClickChainSourcePointId,
    setActiveNodeChainAnnotationId,
    setPendingPolylinePromotionRingClosurePointId,
    setLabelInputPromptPointId,
    setDoubleClickChainSourcePointId,
  } = annotationDraftSessionState;
  const { pointEntries, pointMeasureEntries, selectablePointIds } =
    pointMeasurementCollections;
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
  } = selectionState;
  const {
    getOwnerGroupIdsForPointId,
    getOwnerGroupIdsForEdgeRelationId,
    getRepresentativePointIdForGroupId,
  } = annotationTopologyIndex;

  const { moveGizmo, clearMoveGizmo } = annotationEditState;

  useAnnotationModelIntegritySync({
    annotations,
    pointEntries,
    defaultPolylineSegmentLineMode,
    setDistanceRelations,
    setNodeChainAnnotations,
    computePolygonGroupDerivedDataWithCamera,
  });

  useAnnotationPersistenceSync({
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
  } = usePolylineMeasureState({
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
  } = useAnnotationCursorCandidateState({
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
    clearPendingPolylineRingPromotion,
    clearPendingLabelPlacementAnnotation,
    clearActiveNodeChainDrawingState,
    discardActiveMeasurementDraft,
  } = useAnnotationDraftActions({
    createdPointIds,
    createdRelationIds,
    moveGizmoPointId: moveGizmo.pointId,
    setActiveNodeChainAnnotationId,
    setDoubleClickChainSourcePointId,
    setPendingPolylinePromotionRingClosurePointId,
    setLabelInputPromptPointId,
    setNodeChainAnnotations,
    setDistanceRelations,
    setAnnotations,
    pruneSelectionByRemovedIds,
    clearMeasurementDraftSession,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearMoveGizmo,
  });

  const selectRepresentativeNodeForMeasurementId = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearAnnotationSelection();
        return;
      }

      const representativePointId = getRepresentativePointIdForGroupId(id);
      if (!representativePointId) {
        return;
      }

      clearActiveNodeChainDrawingState();
      clearMoveGizmo();
      selectAnnotationById(representativePointId);
    },
    [
      clearActiveNodeChainDrawingState,
      clearAnnotationSelection,
      clearMoveGizmo,
      getRepresentativePointIdForGroupId,
      selectAnnotationById,
    ]
  );

  const focusAnnotationById = useCallback(
    (id: string | null) => {
      if (id === null) {
        clearAnnotationSelection();
        return;
      }

      const isNodeChainAnnotationId = nodeChainAnnotations.some(
        (annotation) => annotation.id === id
      );
      if (isNodeChainAnnotationId) {
        selectRepresentativeNodeForMeasurementId(id);
        return;
      }

      selectAnnotationById(id);
    },
    [
      clearAnnotationSelection,
      nodeChainAnnotations,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  const isActiveDrawMode = useActiveDrawModeState(
    doubleClickChainSourcePointId,
    selectablePointIds,
    activeNodeChainAnnotationId,
    nodeChainAnnotations
  );

  const {
    finishDistanceMeasurementSession,
    handleDistancePointCreated,
    resolveDistanceRelationSourcePointId,
    upsertDirectDistanceRelation,
  } = useDistanceMeasureAuthoring({
    distanceCreationLineVisibility,
    defaultDistanceRelationLabelVisibility:
      distanceDefaultLabelVisibilityByKind,
    defaultDirectLineLabelMode: distanceDefaultDirectLineLabelMode,
    distanceModeStickyToFirstPoint,
    distanceRelations,
    doubleClickChainSourcePointId,
    selectablePointIds,
    referencePointMeasurementId,
    clearMeasurementDraftSession,
    selectAnnotationById,
    selectAnnotationByIdImmediate,
    setDoubleClickChainSourcePointId,
    setDistanceRelations,
    setActiveNodeChainAnnotationId,
    setReferencePoint,
    trackMeasurementDraftPointIds,
    trackMeasurementDraftRelationId,
  });

  const {
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
  } = useAnnotationsVisualizationState({
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
    moveGizmoPointId: moveGizmo.pointId,
    activeCandidateNodeECEF,
    candidateSupportsEdgeLine,
    resolveDistanceRelationSourcePointId,
    candidateForcesDirectEdgeLine,
    candidateUsesPolylineEdgeRules,
    polylineSegmentLineMode,
    distanceCreationLineVisibility,
    isPolylineCandidateMode,
    defaultDistanceRelationLabelVisibility:
      distanceDefaultLabelVisibilityByKind,
  });

  const {
    cancelPolylineRingPromotion,
    closeActivePolygonAnnotation,
    confirmPolylineRingPromotion,
    finishActivePolylineAnnotation,
    handlePointQueryDoubleClick,
  } = useNodeChainFinishing({
    sceneCameraPosition: getPreferredPlaneFacingPosition(),
    activeToolType,
    activeNodeChainAnnotationId,
    pendingPolylineRingPromotionPointId:
      pendingPolylinePromotionRingClosurePointId,
    annotations,
    nodeChainAnnotations: nodeChainAnnotations,
    setAnnotations,
    setNodeChainAnnotations,
    setPendingPolylineRingPromotionPointId:
      setPendingPolylinePromotionRingClosurePointId,
    clearAnnotationCursor,
    clearActiveNodeChainDrawingState,
    clearMoveGizmo,
    selectRepresentativeNodeForMeasurementId,
  });

  const { handlePointQueryBeforePointCreate } = usePointQuerySelectionGuard({
    scene,
    activeToolType,
    isActiveDrawMode,
    focusedSelectedNodeChainAnnotationId: focusedNodeChainAnnotationId,
    selectionModeActive,
    selectAnnotationById,
    selectRepresentativeNodeForMeasurementId,
  });

  const { handlePointAnnotationCreated, handleLabelAnnotationCreated } =
    usePointAnnotationCreatedHandlers({
      selectAnnotationByIdImmediate,
      setActiveNodeChainAnnotationId,
      setDoubleClickChainSourcePointId,
      setLabelInputPromptPointId,
    });

  const { requestEnterToolType, clearSharedModeExitState } =
    useAnnotationModeTransition({
      annotationsStore,
      setSelectionModeActive,
      clearAnnotationCursor,
      clearAnnotationSelection,
      clearActiveNodeChainDrawingState: clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      clearPendingPolylineRingPromotion,
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
    lockedMeasurementIdSet,
    moveGizmoPointId: moveGizmo.pointId,
    hideMeasurementsOfType,
    setHideMeasurementsOfType,
    setAnnotations,
    setDistanceRelations,
    setNodeChainAnnotations,
    setActiveNodeChainAnnotationId,
    setDoubleClickChainSourcePointId,
    clearAnnotationSelection,
    clearPointSelection,
    clearActiveNodeChainDrawingState,
    clearMoveGizmo,
    getOwnerGroupIdsForPointId,
    computePolygonGroupDerivedDataWithCamera,
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
      annotations,
      nodeChainAnnotations,
      distanceRelations,
      activeNodeChainAnnotationId,
      activeToolType,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      setNodeChainAnnotations,
      setAnnotations,
      setActiveNodeChainAnnotationId,
      setDoubleClickChainSourcePointId,
      resolveDistanceRelationSourcePointId,
      upsertDirectDistanceRelation,
      trackMeasurementDraftPointIds,
      trackMeasurementDraftRelationId,
      clearActiveNodeChainDrawingState: clearActiveNodeChainDrawingState,
      clearMoveGizmo,
      selectAnnotationById,
      selectRepresentativeNodeForMeasurementId,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
    });
  const {
    confirmLabelPlacementById,
    handlePointQueryPointCreated,
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
  } = useAnnotationToolLifecycle({
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
    doubleClickChainSourcePointId,
    selectablePointIds,
    selectedAnnotationId,
    distanceRelations,
    nodeChainAnnotations,
    discardActiveMeasurementDraft,
    finishDistanceMeasurementSession,
    finishActivePolylineAnnotation,
    closeActivePolygonAnnotation,
    handleDistancePointCreated,
    handleNodeChainPointCreated,
    clearSharedModeExitState,
    setLabelInputPromptPointId,
  });

  const candidateAnnotation = useCandidatePreviewAnnotation(
    activeToolType,
    activeCandidateNodeECEF
  );
  const annotationsManagement = {
    annotations,
    annotationCandidate: candidateAnnotation,
    updateAnnotationNameById,
    updatePointLabelAppearanceById,
    deleteAnnotationsByIds,
    toggleAnnotationsLockByIds,
    selectablePointIds,
    pointQueryEnabled,
    hasCandidateNode,
    isActiveDrawMode,
    distanceModeStickyToFirstPoint,
    activeNodeChainAnnotationId,
    nodeChainAnnotations,
    selectRepresentativeNodeForMeasurementId,
    getOwnerGroupIdsForEdgeRelationId,
    focusAnnotationById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    resolveDistanceRelationSourcePointId,
    insertExistingNodeIntoActiveChain,
    upsertDirectDistanceRelation,
    closeActivePolygonAnnotation,
    finishActivePolylineAnnotation,
    finishDistanceMeasurementSession,
    setDoubleClickChainSourcePointId,
    cyclePointLabelMetricModeByMeasurementId,
    labelInputPromptPointId,
    setLabelInputPromptPointId,
    pointTemporaryMode,
    setPointTemporaryMode,
    pointVerticalOffsetMeters,
    setPointVerticalOffsetMeters,
    lastCustomPointAnnotationName,
    isPolylineCandidateMode,
    polylineVerticalOffsetMeters,
    setPolylineVerticalOffsetMeters,
    polylineSegmentLineMode,
    setPolylineSegmentLineMode,
    distanceCreationLineVisibility,
    setDistanceCreationLineVisibilityByKind,
    setDistanceModeStickyToFirstPoint,
    setAnnotations,
    setReferencePoint,
    setDistanceRelations,
    toggleAnnotationsVisibilityByIds,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    handlePointQueryBeforePointCreate,
    handleAnnotationCursorMove,
    visibleMeasurementsForRendering,
    pointRadius,
    setActiveNodeChainAnnotationId,
    effectiveDistanceRelationsForRendering,
    visiblePolygonAnnotationsForRendering,
    cumulativeDistanceByRelationId,
    showPoints,
    showPointLabels,
    effectiveReferenceElevation,
    occlusionChecksEnabled,
    effectiveDistanceToReferenceByPointId,
    pointMarkerBadgeByPointId,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
    markerlessPointIds,
    collapsedPillPointIds,
    moveGizmoOptions,
    annotationCursorEnabled,
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
    referencePoint,
    lockedMeasurementIdSet,
    deleteSelectedAnnotations,
    clearAllAnnotations,
    clearAnnotationsByType,
    clearAnnotationsByIds,
    clearActiveNodeChainDrawingState,
    clearMoveGizmo,
    pointMeasureEntries,
    activeToolType,
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
    isInteractionActive,
    doubleClickChainSourcePointId,
    distanceRelations,
    confirmLabelPlacementById,
    updateAnnotationVisualizerOptionsById,
    setPendingPolylinePromotionRingClosurePointId,
    activeMeasurementId,
    setNodeChainAnnotations,
  };

  const annotationEditing = useAnnotationsEditing({
    annotationsStore,
    scene: cesiumScene,
    annotations: annotationEntryState.annotations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    referencePoint: annotationEntryState.referencePoint,
    selectedAnnotationIds: annotationSelectionState.selectedAnnotationIds,
    focusedNodeChainAnnotationId: focusedNodeChainAnnotationId,
    activeNodeChainAnnotationId:
      annotationDraftSessionState.activeNodeChainAnnotationId,
    defaultDistanceRelationLabelVisibility:
      annotationSettingsState.distanceDefaultLabelVisibilityByKind,
    defaultDirectLineLabelMode:
      annotationSettingsState.distanceDefaultDirectLineLabelMode,
    visibleMeasurementsForRendering:
      annotationsManagement.visibleMeasurementsForRendering,
    pointRadius: annotationSettingsState.pointRadius,
    setAnnotations: annotationEntryState.setAnnotations,
    setDistanceRelations: annotationEntryState.setDistanceRelations,
    setNodeChainAnnotations: annotationEntryState.setNodeChainAnnotations,
    setReferencePoint: annotationEntryState.setReferencePoint,
    setActiveNodeChainAnnotationId:
      annotationDraftSessionState.setActiveNodeChainAnnotationId,
    setDoubleClickChainSourcePointId:
      annotationDraftSessionState.setDoubleClickChainSourcePointId,
    selectAnnotationById: annotationSelectionState.selectAnnotationById,
    getOwnerGroupIdsForEdgeRelationId:
      annotationTopologyIndex.getOwnerGroupIdsForEdgeRelationId,
    selectRepresentativeNodeForMeasurementId:
      annotationsManagement.selectRepresentativeNodeForMeasurementId,
  });
  const annotationCollectionDomain = useAnnotationCollectionDomain({
    scene: cesiumScene,
    annotations: annotationEntryState.annotations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    pointMeasureEntries: pointMeasurementCollections.pointMeasureEntries,
    referencePoint: annotationEntryState.referencePoint,
    setAnnotations: annotationEntryState.setAnnotations,
    setReferencePoint: annotationEntryState.setReferencePoint,
    referencePointSyncEpsilonMeters: 0.001,
  });

  const annotationUserInteraction = useAnnotationsUserInteraction(
    {
      annotations: annotationEntryState.annotations,
      activeToolType: annotationsManagement.activeToolType,
      selectionModeActive: annotationSelectionState.selectionModeActive,
      effectiveSelectModeAdditive:
        annotationSelectionState.effectiveSelectModeAdditive,
      selectablePointIds: pointMeasurementCollections.selectablePointIds,
      moveGizmoPointId: annotationEditing.moveGizmoPointId,
      isMoveGizmoDragging: annotationEditing.isMoveGizmoDragging,
      pointQueryEnabled: annotationsManagement.pointQueryEnabled,
      hasCandidateNode: annotationsManagement.hasCandidateNode,
      isActiveDrawMode: annotationsManagement.isActiveDrawMode,
      distanceModeStickyToFirstPoint:
        annotationsManagement.distanceModeStickyToFirstPoint,
      activeNodeChainAnnotationId:
        annotationDraftSessionState.activeNodeChainAnnotationId,
      nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
      selectAnnotationIds: annotationSelectionState.selectAnnotationIds,
      selectAnnotationById: annotationSelectionState.selectAnnotationById,
      syncAnnotationCursorToExistingPoint:
        annotationsManagement.syncAnnotationCursorToExistingPoint,
      releaseAnnotationCursorSnap:
        annotationsManagement.releaseAnnotationCursorSnap,
      scheduleAnnotationCursorSnapRelease:
        annotationsManagement.scheduleAnnotationCursorSnapRelease,
      resolveDistanceRelationSourcePointId:
        annotationsManagement.resolveDistanceRelationSourcePointId,
      insertExistingNodeIntoActiveChain:
        annotationsManagement.insertExistingNodeIntoActiveChain,
      upsertDirectDistanceRelation:
        annotationsManagement.upsertDirectDistanceRelation,
      closeActivePolygonAnnotation:
        annotationsManagement.closeActivePolygonAnnotation,
      finishActivePolylineAnnotation:
        annotationsManagement.finishActivePolylineAnnotation,
      finishDistanceMeasurementSession:
        annotationsManagement.finishDistanceMeasurementSession,
      setDoubleClickChainSourcePointId:
        annotationDraftSessionState.setDoubleClickChainSourcePointId,
      selectedAnnotationId: annotationSelectionState.selectedAnnotationId,
      cyclePointLabelMetricModeByMeasurementId:
        annotationsManagement.cyclePointLabelMetricModeByMeasurementId,
      labelInputPromptPointId: annotationsManagement.labelInputPromptPointId,
      setLabelInputPromptPointId:
        annotationsManagement.setLabelInputPromptPointId,
      setReferencePointId: annotationCollectionDomain.setReferencePointId,
      pointTemporaryMode: annotationsManagement.pointTemporaryMode,
      pointVerticalOffsetMeters:
        annotationsManagement.pointVerticalOffsetMeters,
      lastCustomPointAnnotationName:
        annotationsManagement.lastCustomPointAnnotationName,
      isPolylineCandidateMode: annotationsManagement.isPolylineCandidateMode,
      polylineVerticalOffsetMeters:
        annotationsManagement.polylineVerticalOffsetMeters,
      scene: cesiumScene,
      setAnnotations: annotationEntryState.setAnnotations,
      handlePointQueryPointCreated:
        annotationsManagement.handlePointQueryPointCreated,
      handlePointQueryDoubleClick:
        annotationsManagement.handlePointQueryDoubleClick,
      handlePointQueryBeforePointCreate:
        annotationsManagement.handlePointQueryBeforePointCreate,
      handleAnnotationCursorMove:
        annotationsManagement.handleAnnotationCursorMove,
    },
    annotationEditing
  );
  useAnnotationsInteractionLifecycle({
    annotations: annotationEntryState.annotations,
    selectedAnnotationIds: annotationSelectionState.selectedAnnotationIds,
    selectablePointIds: pointMeasurementCollections.selectablePointIds,
    lockedMeasurementIdSet: annotationsManagement.lockedMeasurementIdSet,
    selectedAnnotationId: annotationSelectionState.selectedAnnotationId,
    deleteSelectedAnnotations: annotationsManagement.deleteSelectedAnnotations,
    clearAnnotationsByIds: annotationsManagement.clearAnnotationsByIds,
    pointMeasureEntries: pointMeasurementCollections.pointMeasureEntries,
    selectAnnotationById: annotationSelectionState.selectAnnotationById,
    setAnnotations: annotationEntryState.setAnnotations,
    pointTemporaryMode: annotationsManagement.pointTemporaryMode,
    activeToolType: annotationsManagement.activeToolType,
    requestStartMeasurement: annotationsManagement.requestStartMeasurement,
    setDoubleClickChainSourcePointId:
      annotationDraftSessionState.setDoubleClickChainSourcePointId,
    isInteractionActive: annotationsManagement.isInteractionActive,
    doubleClickChainSourcePointId:
      annotationDraftSessionState.doubleClickChainSourcePointId,
    distanceRelations: annotationEntryState.distanceRelations,
    nodeChainAnnotations: annotationEntryState.nodeChainAnnotations,
    setPendingPolylinePromotionRingClosurePointId:
      annotationDraftSessionState.setPendingPolylinePromotionRingClosurePointId,
    activeNodeChainAnnotationId:
      annotationDraftSessionState.activeNodeChainAnnotationId,
    setActiveNodeChainAnnotationId:
      annotationDraftSessionState.setActiveNodeChainAnnotationId,
    setNodeChainAnnotations: annotationEntryState.setNodeChainAnnotations,
    isPointMeasureCreateModeActive:
      annotationUserInteraction.isPointMeasureCreateModeActive,
  });
  useAnnotationsVisualization(
    {
      scene: cesiumScene,
      visibleMeasurementsForRendering:
        annotationsManagement.visibleMeasurementsForRendering,
      effectiveDistanceRelationsForRendering:
        annotationsManagement.effectiveDistanceRelationsForRendering,
      visiblePolygonAnnotationsForRendering:
        annotationsManagement.visiblePolygonAnnotationsForRendering,
      focusedNodeChainAnnotationId: focusedNodeChainAnnotationId,
      activeNodeChainAnnotationId:
        annotationDraftSessionState.activeNodeChainAnnotationId,
      cumulativeDistanceByRelationId:
        annotationsManagement.cumulativeDistanceByRelationId,
      showPoints: annotationsManagement.showPoints,
      showPointLabels: annotationsManagement.showPointLabels,
      effectiveReferenceElevation:
        annotationsManagement.effectiveReferenceElevation,
      occlusionChecksEnabled: annotationsManagement.occlusionChecksEnabled,
      options,
      effectiveDistanceToReferenceByPointId:
        annotationsManagement.effectiveDistanceToReferenceByPointId,
      pointMarkerBadgeByPointId:
        annotationsManagement.pointMarkerBadgeByPointId,
      hiddenPointLabelIds: annotationsManagement.hiddenPointLabelIds,
      effectiveFullyHiddenPointIds:
        annotationsManagement.effectiveFullyHiddenPointIds,
      markerlessPointIds: annotationsManagement.markerlessPointIds,
      collapsedPillPointIds: annotationsManagement.collapsedPillPointIds,
      labelInputPromptPointId: annotationsManagement.labelInputPromptPointId,
      moveGizmoPointId: annotationEditing.moveGizmoPointId,
      moveGizmoOptions: annotationsManagement.moveGizmoOptions,
      isMoveGizmoDragging: annotationEditing.isMoveGizmoDragging,
      annotationCursorEnabled: annotationsManagement.annotationCursorEnabled,
      activeCandidateNodeECEF: annotationsManagement.activeCandidateNodeECEF,
      cursorScreenPosition: annotationsManagement.cursorScreenPosition,
      activeCandidateNodeSurfaceNormalECEF:
        annotationsManagement.activeCandidateNodeSurfaceNormalECEF,
      activeCandidateNodeVerticalOffsetAnchorECEF:
        annotationsManagement.activeCandidateNodeVerticalOffsetAnchorECEF,
      activeToolType: annotationsManagement.activeToolType,
      candidateConnectionPreview:
        annotationsManagement.candidateConnectionPreview,
      candidatePreviewDistanceMeters:
        annotationsManagement.candidatePreviewDistanceMeters,
      referencePoint: annotationEntryState.referencePoint,
      pointRadius: annotationSettingsState.pointRadius,
      annotationSelection: annotationSelectionState.annotationSelection,
      rectangleSelection: annotationSelectionState.rectangleSelection,
    },
    annotationUserInteraction,
    annotationEditing
  );
  const toolsContextValue = useMemo<AnnotationToolsContextType>(
    () => ({
      activeToolType: annotationsManagement.activeToolType,
      requestModeChange: annotationsManagement.requestModeChange,
      requestStartMeasurement: annotationsManagement.requestStartMeasurement,
      requestCloseActiveMeasurement:
        annotationsManagement.requestCloseActiveMeasurement,
    }),
    [
      annotationsManagement.activeToolType,
      annotationsManagement.requestCloseActiveMeasurement,
      annotationsManagement.requestModeChange,
      annotationsManagement.requestStartMeasurement,
    ]
  );

  const selectionContextValue = useMemo<AnnotationSelectionContextType>(
    () => ({
      activeAnnotationId: annotationsManagement.activeMeasurementId,
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
      annotationsManagement.activeMeasurementId,
      annotationSelectionState.clearAnnotationSelection,
      annotationSelectionState.selectAnnotationIds,
      annotationSelectionState.selectModeAdditive,
      annotationSelectionState.selectModeRectangle,
      annotationSelectionState.selectedAnnotationIds,
      annotationSelectionState.selectionModeActive,
      annotationSelectionState.setSelectModeAdditive,
      annotationSelectionState.setSelectModeRectangle,
      annotationSelectionState.setSelectionModeActive,
    ]
  );

  const collectionContextValue = useMemo<AnnotationCollectionContextType>(
    () => ({
      items: annotationEntryState.annotations,
      byType: annotationCollectionDomain.annotationsByType,
      getNavigationItems:
        annotationCollectionDomain.getAnnotationsForNavigation,
      getIndexByType: annotationCollectionDomain.getAnnotationIndexByType,
      getOrderByType: annotationCollectionDomain.getAnnotationOrderByType,
      getNextOrderByType:
        annotationCollectionDomain.getNextAnnotationOrderByType,
      add: annotationCollectionDomain.addAnnotation,
      updateById: annotationCollectionDomain.updateAnnotationById,
      updateNameById: annotationsManagement.updateAnnotationNameById,
      updateVisualizerOptionsById:
        annotationsManagement.updateAnnotationVisualizerOptionsById,
      updatePointLabelAppearanceById:
        annotationsManagement.updatePointLabelAppearanceById,
      removeByIds: annotationsManagement.deleteAnnotationsByIds,
      removeSelection: annotationsManagement.deleteSelectedAnnotations,
      removeAll: annotationsManagement.clearAllAnnotations,
      removeByType: annotationsManagement.clearAnnotationsByType,
      toggleLockByIds: annotationsManagement.toggleAnnotationsLockByIds,
      toggleVisibilityByIds:
        annotationsManagement.toggleAnnotationsVisibilityByIds,
      setReferencePointId: annotationCollectionDomain.setReferencePointId,
      confirmLabelPlacementById:
        annotationsManagement.confirmLabelPlacementById,
      flyToById: annotationCollectionDomain.flyToAnnotationById,
      focusById: annotationsManagement.focusAnnotationById,
      flyToAll: annotationCollectionDomain.flyToAllAnnotations,
    }),
    [
      annotationEntryState.annotations,
      annotationCollectionDomain.addAnnotation,
      annotationCollectionDomain.annotationsByType,
      annotationCollectionDomain.flyToAllAnnotations,
      annotationCollectionDomain.flyToAnnotationById,
      annotationCollectionDomain.getAnnotationIndexByType,
      annotationCollectionDomain.getAnnotationOrderByType,
      annotationCollectionDomain.getAnnotationsForNavigation,
      annotationCollectionDomain.getNextAnnotationOrderByType,
      annotationCollectionDomain.setReferencePointId,
      annotationCollectionDomain.updateAnnotationById,
      annotationsManagement.clearAllAnnotations,
      annotationsManagement.clearAnnotationsByType,
      annotationsManagement.confirmLabelPlacementById,
      annotationsManagement.deleteAnnotationsByIds,
      annotationsManagement.deleteSelectedAnnotations,
      annotationsManagement.focusAnnotationById,
      annotationsManagement.toggleAnnotationsLockByIds,
      annotationsManagement.toggleAnnotationsVisibilityByIds,
      annotationsManagement.updateAnnotationNameById,
      annotationsManagement.updateAnnotationVisualizerOptionsById,
      annotationsManagement.updatePointLabelAppearanceById,
    ]
  );

  const editingContextValue = useMemo<AnnotationEditingContextType>(
    () => ({
      activeTarget: annotationEditing.activeEditTarget,
      requestStart: annotationEditing.requestStartEdit,
      requestStop: annotationEditing.requestStopEdit,
      requestUpdateTarget: annotationEditing.requestUpdateEditTarget,
    }),
    [
      annotationEditing.activeEditTarget,
      annotationEditing.requestStartEdit,
      annotationEditing.requestStopEdit,
      annotationEditing.requestUpdateEditTarget,
    ]
  );

  const settingsContextValue = useMemo<AnnotationSettingsContextType>(
    () => ({
      point: {
        verticalOffsetMeters: annotationsManagement.pointVerticalOffsetMeters,
        setVerticalOffsetMeters:
          annotationsManagement.setPointVerticalOffsetMeters,
        temporaryMode: annotationsManagement.pointTemporaryMode,
        setTemporaryMode: annotationsManagement.setPointTemporaryMode,
      },
      distance: {
        stickyToFirstPoint:
          annotationsManagement.distanceModeStickyToFirstPoint,
        setStickyToFirstPoint:
          annotationsManagement.setDistanceModeStickyToFirstPoint,
        creationLineVisibility:
          annotationsManagement.distanceCreationLineVisibility,
        setCreationLineVisibilityByKind:
          annotationsManagement.setDistanceCreationLineVisibilityByKind,
      },
      polyline: {
        verticalOffsetMeters:
          annotationsManagement.polylineVerticalOffsetMeters,
        setVerticalOffsetMeters:
          annotationsManagement.setPolylineVerticalOffsetMeters,
        segmentLineMode: annotationsManagement.polylineSegmentLineMode,
        setSegmentLineMode: annotationsManagement.setPolylineSegmentLineMode,
      },
    }),
    [
      annotationsManagement.distanceCreationLineVisibility,
      annotationsManagement.distanceModeStickyToFirstPoint,
      annotationsManagement.pointVerticalOffsetMeters,
      annotationsManagement.pointTemporaryMode,
      annotationsManagement.polylineSegmentLineMode,
      annotationsManagement.polylineVerticalOffsetMeters,
      annotationsManagement.setDistanceCreationLineVisibilityByKind,
      annotationsManagement.setDistanceModeStickyToFirstPoint,
      annotationsManagement.setPointVerticalOffsetMeters,
      annotationsManagement.setPointTemporaryMode,
      annotationsManagement.setPolylineSegmentLineMode,
      annotationsManagement.setPolylineVerticalOffsetMeters,
    ]
  );

  const annotationsStoreSnapshot = useMemo<AnnotationsStoreSnapshot>(
    () => ({
      tools: toolsContextValue,
      selection: selectionContextValue,
      annotations: collectionContextValue,
      edit: editingContextValue,
      settings: settingsContextValue,
    }),
    [
      collectionContextValue,
      editingContextValue,
      selectionContextValue,
      settingsContextValue,
      toolsContextValue,
    ]
  );

  useLayoutEffect(() => {
    annotationsStore.setState((currentState) =>
      Object.is(currentState.tools, annotationsStoreSnapshot.tools) &&
      Object.is(currentState.selection, annotationsStoreSnapshot.selection) &&
      Object.is(
        currentState.annotations,
        annotationsStoreSnapshot.annotations
      ) &&
      Object.is(currentState.edit, annotationsStoreSnapshot.edit) &&
      Object.is(currentState.settings, annotationsStoreSnapshot.settings)
        ? currentState
        : {
            ...currentState,
            ...annotationsStoreSnapshot,
          }
    );
  }, [annotationsStore, annotationsStoreSnapshot]);

  useLayoutEffect(() => {
    annotationsStore.setState((currentState) =>
      Object.is(
        currentState.candidateAnnotation,
        annotationsManagement.annotationCandidate
      )
        ? currentState
        : {
            ...currentState,
            candidateAnnotation: annotationsManagement.annotationCandidate,
          }
    );
  }, [annotationsManagement.annotationCandidate, annotationsStore]);

  return (
    <AnnotationsStoreContext.Provider value={annotationsStore}>
      {children}
    </AnnotationsStoreContext.Provider>
  );
};

const useAnnotationsStore = (hookName: string): AnnotationsStore =>
  useRequiredAnnotationsStore(useContext(AnnotationsStoreContext), hookName);

const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;

export const useAnnotationTools = (): AnnotationToolsContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationTools");

  return useStoreSelector(annotationsStore, (state) => state.tools);
};

export const useAnnotationSelectionState =
  (): AnnotationSelectionContextType => {
    const annotationsStore = useAnnotationsStore("useAnnotationSelectionState");

    return useStoreSelector(annotationsStore, (state) => state.selection);
  };

export const useAnnotationCollection = (): AnnotationCollectionContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationCollection");

  return useStoreSelector(annotationsStore, (state) => state.annotations);
};

export const useAnnotationEditingState = (): AnnotationEditingContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationEditingState");

  return useStoreSelector(annotationsStore, (state) => state.edit);
};

export const useAnnotationSettings = (): AnnotationSettingsContextType => {
  const annotationsStore = useAnnotationsStore("useAnnotationSettings");

  return useStoreSelector(annotationsStore, (state) => state.settings);
};

export const useCandidateAnnotation = (): AnnotationEntry | null => {
  const annotationsStore = useAnnotationsStore("useCandidateAnnotation");

  return useStoreSelector(
    annotationsStore,
    (state) => state.candidateAnnotation
  );
};

export const usePendingLabelPlacementTargetId = (): string | null => {
  const annotationsStore = useAnnotationsStore(
    "usePendingLabelPlacementTargetId"
  );

  return useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
};

export const useReferencePoint = (): Cartesian3 | null => {
  const annotationsStore = useAnnotationsStore("useReferencePoint");

  return useStoreSelector(annotationsStore, (state) => state.referencePoint);
};

export type AnnotationDistanceReadModel = {
  referencePoint: Cartesian3 | null;
  hasPreviewAnchor: boolean;
  distanceRelations: PointDistanceRelation[];
};

export const useDistanceAnnotationReadModel =
  (): AnnotationDistanceReadModel => {
    const annotationsStore = useAnnotationsStore(
      "useDistanceAnnotationReadModel"
    );
    const referencePoint = useStoreSelector(
      annotationsStore,
      (state) => state.referencePoint
    );
    const distanceRelations = useStoreSelector(
      annotationsStore,
      (state) => state.distanceRelations
    );
    const annotationEntries = useStoreSelector(
      annotationsStore,
      (state) => state.annotationEntries
    );
    const activeToolType = useStoreSelector(
      annotationsStore,
      (state) => state.tools.activeToolType
    );
    const openChainPointId = useStoreSelector(
      annotationsStore,
      (state) => state.openChainPointId
    );
    const distanceModeStickyToFirstPoint = useStoreSelector(
      annotationsStore,
      (state) => state.settingsState.distance.stickyToFirstPoint
    );

    const pointEntries = useMemo(
      () => annotationEntries.filter(isPointAnnotationEntry),
      [annotationEntries]
    );
    const referencePointMeasurementId = useMemo(() => {
      if (!referencePoint) {
        return null;
      }

      const referenceMeasurement =
        pointEntries.find(
          (pointEntry) =>
            Cartesian3.distance(pointEntry.geometryECEF, referencePoint) <=
            REFERENCE_POINT_SYNC_EPSILON_METERS
        ) ?? null;

      return referenceMeasurement?.id ?? null;
    }, [pointEntries, referencePoint]);
    const pointIdSet = useMemo(
      () => new Set(pointEntries.map((pointEntry) => pointEntry.id)),
      [pointEntries]
    );
    const hasPreviewAnchor = useMemo(() => {
      if (activeToolType !== ANNOTATION_TYPE_DISTANCE) {
        return false;
      }

      if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
        return true;
      }

      return Boolean(openChainPointId && pointIdSet.has(openChainPointId));
    }, [
      activeToolType,
      distanceModeStickyToFirstPoint,
      openChainPointId,
      pointIdSet,
      referencePointMeasurementId,
    ]);

    return useMemo(
      () => ({
        referencePoint,
        hasPreviewAnchor,
        distanceRelations,
      }),
      [distanceRelations, hasPreviewAnchor, referencePoint]
    );
  };

export const useNodeChainAnnotations = (): NodeChainAnnotation[] => {
  const annotationsStore = useAnnotationsStore("useNodeChainAnnotations");

  return useStoreSelector(
    annotationsStore,
    (state) => state.nodeChainAnnotations
  );
};

export type AnnotationNodeChainReadModel = {
  measurements: NodeChainAnnotation[];
  polylineMeasurements: NodeChainAnnotation[];
  groundPolygons: NodeChainAnnotation[];
  planarPolygons: NodeChainAnnotation[];
  verticalPolygons: NodeChainAnnotation[];
  polylinePaths: DerivedPolylinePath[];
  focusedMeasurementId: string | null;
  activeMeasurementId: string | null;
};

export const useNodeChainAnnotationReadModel =
  (): AnnotationNodeChainReadModel => {
    const annotationsStore = useAnnotationsStore(
      "useNodeChainAnnotationReadModel"
    );
    const nodeChainAnnotations = useStoreSelector(
      annotationsStore,
      (state) => state.nodeChainAnnotations
    );
    const activeMeasurementId = useStoreSelector(
      annotationsStore,
      (state) => state.activeNodeChainAnnotationId
    );
    const annotationEntries = useStoreSelector(
      annotationsStore,
      (state) => state.annotationEntries
    );
    const selectedAnnotationIds = useStoreSelector(
      annotationsStore,
      (state) => state.selection.ids
    );
    const defaultPolylineVerticalOffsetMeters = useStoreSelector(
      annotationsStore,
      (state) => state.settingsState.polyline.defaultVerticalOffsetMeters
    );

    const nodeChainAnnotationsByType = useMemo(() => {
      const byType = new Map<string, NodeChainAnnotation[]>();
      byType.set(ANNOTATION_TYPE_POLYLINE, []);
      byType.set(ANNOTATION_TYPE_AREA_GROUND, []);
      byType.set(ANNOTATION_TYPE_AREA_PLANAR, []);
      byType.set(ANNOTATION_TYPE_AREA_VERTICAL, []);

      nodeChainAnnotations.forEach((measurement) => {
        const typedBucket = byType.get(measurement.type);
        if (typedBucket) {
          typedBucket.push(measurement);
        }
      });

      return byType;
    }, [nodeChainAnnotations]);
    const polylinePaths = useMemo(
      () =>
        buildDerivedPolylinePaths({
          annotations: annotationEntries,
          nodeChainAnnotations: nodeChainAnnotations,
          defaultVerticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
          useOffsetAnchors: true,
        }),
      [
        annotationEntries,
        defaultPolylineVerticalOffsetMeters,
        nodeChainAnnotations,
      ]
    );
    const focusedMeasurementId = useMemo(() => {
      for (
        let index = selectedAnnotationIds.length - 1;
        index >= 0;
        index -= 1
      ) {
        const selectedAnnotationId = selectedAnnotationIds[index];
        if (!selectedAnnotationId) {
          continue;
        }

        const focusedMeasurement =
          nodeChainAnnotations.find((measurement) =>
            measurement.nodeIds.includes(selectedAnnotationId)
          ) ?? null;
        if (focusedMeasurement) {
          return focusedMeasurement.id;
        }
      }

      return activeMeasurementId;
    }, [activeMeasurementId, nodeChainAnnotations, selectedAnnotationIds]);

    return useMemo(
      () => ({
        measurements: nodeChainAnnotations,
        polylineMeasurements:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_POLYLINE) ?? [],
        groundPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_GROUND) ?? [],
        planarPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_PLANAR) ?? [],
        verticalPolygons:
          nodeChainAnnotationsByType.get(ANNOTATION_TYPE_AREA_VERTICAL) ?? [],
        polylinePaths,
        focusedMeasurementId,
        activeMeasurementId,
      }),
      [
        activeMeasurementId,
        focusedMeasurementId,
        nodeChainAnnotationsByType,
        nodeChainAnnotations,
        polylinePaths,
      ]
    );
  };
export type AnnotationsOptions = {
  distance?: {
    stickyToFirstPoint?: boolean;
    creationLineVisibility?: Partial<Record<ReferenceLineLabelKind, boolean>>;
    defaultLabelVisibilityByKind?: DistanceRelationLabelVisibilityByKind;
    defaultDirectLineLabelMode?: DirectLineLabelMode;
  };
  pointQueries?: {
    enabled?: boolean;
    radius?: number;
    verticalOffsetMeters?: number;
    heightOffset?: number;
    temporaryMode?: boolean;
  };
  cartographicCRS?: "string";
  initialToolType?: AnnotationToolType;
  initialPersistenceState?: AnnotationPersistenceEnvelopeV2 | null;
  onPersistenceStateChange?: (state: AnnotationPersistenceEnvelopeV2) => void;
  labels?: PointLabelLayoutConfigOverrides;
  moveGizmo?: {
    markerSizeScale?: number;
    labelDistanceScale?: number;
  };
};

const defaultOptions: AnnotationsOptions = {
  initialToolType: ANNOTATION_TYPE_POINT,
};

const defaultPointQueryOptions: AnnotationsOptions["pointQueries"] = {
  enabled: true,
  radius: 1,
  verticalOffsetMeters: 0,
  heightOffset: 1.5,
  temporaryMode: false,
};
const defaultMoveGizmoOptions: NonNullable<AnnotationsOptions["moveGizmo"]> = {
  markerSizeScale: 1,
  labelDistanceScale: 1,
};
const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;
