/* @refresh reset */
import {
  useState,
  useMemo,
  useCallback,
  useRef,
  Dispatch,
  SetStateAction,
  useEffect,
} from "react";
import {
  Cartesian2,
  Cartesian3,
  Cartesian4,
  type Scene,
  Matrix4,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  cartesian3FromJson,
  getEllipsoidalAltitudeOrZero,
  getDegreesFromCartesian,
  getLocalUpDirectionAtAnchor,
  getPositionFromLocalFrame,
  getPositionInLocalFrame,
  getPositionWithVerticalOffsetFromAnchor,
  getSignedAngleDegAroundAxis,
  normalizeDirection,
  projectPointToHorizontalPlaneAtAnchor,
  resolveLocalFrameVectors,
} from "@carma/cesium";
import { useLabelOverlay } from "@carma-providers/label-overlay";

import { useStoreSelector } from "@carma-commons/react-store";
import { normalizeOptions } from "@carma-commons/utils";
import {
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_LABEL,
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_POLYLINE,
  SELECT_TOOL_TYPE,
  DEFAULT_POINT_LABEL_METRIC_MODE,
  LINEAR_SEGMENT_LINE_MODE_COMPONENTS,
  LINEAR_SEGMENT_LINE_MODE_DIRECT,
  isPointAnnotationEntry,
  isPointMeasurementEntry,
  type AnnotationCollection,
  type AnnotationEntry,
  normalizeLabelAppearance,
  buildPointGeometryRows,
  buildDerivedPolylinePaths,
  applyLabelAppearance,
  areDistanceRelationsEquivalent,
  arePlanarPolygonGroupsEquivalent,
  buildGeometryEdgeTable,
  buildPolygonGroupVertexTable,
  type CandidateConnectionPreview,
  getConnectedOpenPolylineGroupIds,
  getDistanceRelationId,
  getMeasurementEntryFlyToPoints,
  getMeasurementEdgeId,
  getNextDirectLineLabelMode,
  getNextPointLabelMetricMode,
  getPointById,
  getPointPositionMap,
  hasAnyVisibleDistanceRelationLine,
  isAreaToolType,
  isSameDistanceRelationPair,
  buildEdgeRelationIdsForPolygon,
  buildVerticalAutoCloseRectangle,
  computePolygonGroupDerivedData,
  computePolylinePlanarAngleSumDeg,
  createPlaneFromThreePoints,
  distancePointToPlane,
  getVerticalPolygonAxisRotationSuffix,
  orientPlaneNormalTowardPosition,
  projectPointOntoPlane,
  withDistanceRelationEdgeId,
  type AnnotationGeometryPoint,
  type AnnotationLabelAppearance,
  type AnnotationMode,
  type AnnotationPersistenceEnvelopeV2,
  type AnnotationToolType,
  type DerivedPolylinePath,
  type PlanarMeasurementGroup,
  type PlanarPolylineGroup,
  type PlanarPolygonGroup,
  type PlanarPolygonAreaType,
  type PlanarPolygonPlane,
  type PointDistanceRelation,
  type PointLabelMetricMode,
  type ReferenceLineLabelKind,
  type DirectLineLabelMode,
  type LinearSegmentLineMode,
} from "@carma-mapping/annotations/core";
import type { PointLabelLayoutConfigOverrides } from "@carma-providers/label-overlay";
import {
  flyToMeasurementPoints,
  useCesiumOverlaySync,
} from "@carma-mapping/annotations/cesium";
import {
  type AnnotationCreatePayload,
  type AnnotationPointMarkerBadge,
  useAnnotationSelection,
  useAnnotationEntryMutations,
  useLockedMeasurementIdSet,
} from "../base";
import type { AnnotationsStore } from "../store";
import {
  ANNOTATION_CANDIDATE_KIND_DISTANCE,
  ANNOTATION_CANDIDATE_KIND_NONE,
  ANNOTATION_CANDIDATE_KIND_POINT,
  ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
  ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
  ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
  ANNOTATION_CANDIDATE_KIND_POLYLINE,
  type AnnotationCandidateDescriptor,
  useAnnotationCandidateState,
} from "./useAnnotationCandidateState";
import { useAnnotationsCollectionState } from "./useAnnotationsCollectionState";
import { useAnnotationsRenderState } from "./useAnnotationsRenderState";
import { useAnnotationCreateDefaults } from "./useAnnotationCreateDefaults";
import { useAnnotationEditState } from "./useAnnotationEditState";
import { useMeasurementOwnershipIndex } from "./useMeasurementOwnershipIndex";
import { useAnnotationsPolylineState } from "./polyline/useAnnotationsPolylineState";
import { useClosedAreaSelectionState } from "./selection/useClosedAreaSelectionState";
import { usePointMeasurementCollections } from "./point/usePointMeasurementCollections";
import { usePointVisibilityState } from "./point/usePointVisibilityState";
import { usePointLabelAnchorState } from "./point/label/usePointLabelAnchorState";
import { usePointLabelVisibilityState } from "./point/label/usePointLabelVisibilityState";
import { usePointMarkerBadgeState } from "./point/label/usePointMarkerBadgeState";
import { useStandaloneDistancePointState } from "./point/label/useStandaloneDistancePointState";
import { useSyncPointLabelAnchors } from "./point/label/useSyncPointLabelAnchors";
import { usePointEditingState } from "./point/editing/usePointEditingState";
import { useAnnotationModeLifecycle } from "../mode-lifecycle/useAnnotationModeLifecycle";
import { useAnnotationToolSessions } from "../mode-lifecycle/useAnnotationToolSessions";
import { useMeasurementDraftRollbackState } from "../mode-lifecycle/useMeasurementDraftRollbackState";
import { usePointMeasureModeSession } from "../mode-lifecycle/modes/usePointMeasureModeSession";
import { useLabelPlacementModeSession } from "../mode-lifecycle/modes/useLabelPlacementModeSession";

const VERTICAL_POLYGON_AXIS_ALIGNMENT_DOT_EPSILON = 0.999;
const VERTICAL_POLYGON_EN_MATCH_EPSILON_METERS = 0.05;
export type AnnotationsOptions = {
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
const REFERENCE_POINT_SYNC_EPSILON_METERS = 0.001;
const PERSISTENCE_RESTORE_DELAY_MS = 250;
const PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS = 0.2;
const PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG = 150;
const DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY: Record<
  ReferenceLineLabelKind,
  boolean
> = {
  direct: true,
  vertical: true,
  horizontal: true,
};
const DEFAULT_DIRECT_LINE_LABEL_MODE: DirectLineLabelMode = "segment";

const resolveSetStateAction = <TValue>(
  action: SetStateAction<TValue>,
  previousValue: TValue
): TValue =>
  typeof action === "function"
    ? (action as (previousValue: TValue) => TValue)(previousValue)
    : action;

export const useAnnotationsManagement = (
  annotationsStore: AnnotationsStore,
  scene: Scene,
  enabled: boolean = true,
  options?: AnnotationsOptions
) => {
  const getPreferredPlaneFacingPosition = useCallback((): Cartesian3 | null => {
    if (!scene || scene.isDestroyed()) return null;
    return scene.camera.positionWC;
  }, [scene]);
  const orientPlaneTowardSceneCamera = useCallback(
    (plane: PlanarPolygonPlane): PlanarPolygonPlane =>
      orientPlaneNormalTowardPosition(plane, getPreferredPlaneFacingPosition()),
    [getPreferredPlaneFacingPosition]
  );
  const computePolygonGroupDerivedDataWithCamera = useCallback(
    (group: PlanarMeasurementGroup, pointById: Map<string, Cartesian3>) =>
      computePolygonGroupDerivedData(group, pointById, {
        preferredFacingPositionECEF: getPreferredPlaneFacingPosition(),
      }),
    [getPreferredPlaneFacingPosition]
  );
  const requestUpdateCallback = useCesiumOverlaySync(scene);
  const overlayContext = useLabelOverlay();

  useEffect(
    function effectSyncOverlayContextPositions() {
      if (overlayContext && overlayContext.updatePositions) {
        requestUpdateCallback(overlayContext.updatePositions);
      }
    },
    [overlayContext, requestUpdateCallback]
  );

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

  const updateAnnotationEntryNameById = useCallback(
    (id: string, name: string) => {
      const trimmedName = name.trim();
      setAnnotations((previousAnnotations) => {
        let hasChanges = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (annotation.id !== id) {
            return annotation;
          }

          const currentName = annotation.name ?? "";
          if (currentName === trimmedName) {
            return annotation;
          }

          hasChanges = true;
          return {
            ...annotation,
            name: trimmedName,
          };
        });
        return hasChanges ? nextAnnotations : previousAnnotations;
      });
    },
    []
  );

  const polylineVerticalOffsetVisualOnly = true;
  const setPolylineVerticalOffsetVisualOnly = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(() => {
    // Polyline offset is intentionally always interpreted as visual-only.
  }, []);
  const annotations = useStoreSelector(
    annotationsStore,
    (state) => state.annotationEntries
  );
  const distanceRelations = useStoreSelector(
    annotationsStore,
    (state) => state.distanceRelations
  );
  const planarMeasurements = useStoreSelector(
    annotationsStore,
    (state) => state.planarMeasurements
  );
  const setAnnotations = useCallback<
    Dispatch<SetStateAction<AnnotationCollection>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextAnnotations = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.annotationEntries
        );

        return Object.is(nextAnnotations, previousStoreState.annotationEntries)
          ? previousStoreState
          : {
              ...previousStoreState,
              annotationEntries: nextAnnotations,
            };
      });
    },
    [annotationsStore]
  );
  const setDistanceRelations = useCallback<
    Dispatch<SetStateAction<PointDistanceRelation[]>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextDistanceRelations = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.distanceRelations
        );

        return Object.is(
          nextDistanceRelations,
          previousStoreState.distanceRelations
        )
          ? previousStoreState
          : {
              ...previousStoreState,
              distanceRelations: nextDistanceRelations,
            };
      });
    },
    [annotationsStore]
  );
  const setPlanarMeasurements = useCallback<
    Dispatch<SetStateAction<PlanarMeasurementGroup[]>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextPlanarMeasurements = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.planarMeasurements
        );

        return Object.is(
          nextPlanarMeasurements,
          previousStoreState.planarMeasurements
        )
          ? previousStoreState
          : {
              ...previousStoreState,
              planarMeasurements: nextPlanarMeasurements,
            };
      });
    },
    [annotationsStore]
  );
  const planarPolygonGroups = planarMeasurements;
  const referencePoint = useStoreSelector(
    annotationsStore,
    (state) => state.referencePoint
  );
  const setReferencePoint = useCallback<
    Dispatch<SetStateAction<Cartesian3 | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextReferencePoint = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.referencePoint
        );

        return Object.is(nextReferencePoint, previousStoreState.referencePoint)
          ? previousStoreState
          : {
              ...previousStoreState,
              referencePoint: nextReferencePoint,
            };
      });
    },
    [annotationsStore]
  );
  const annotationToolType = useStoreSelector(
    annotationsStore,
    (state) => state.annotationToolType
  );
  const settingsState = useStoreSelector(
    annotationsStore,
    (state) => state.settingsState
  );
  const pointQuerySettings = settingsState.pointQuery;
  const pointSettings = settingsState.point;
  const distanceSettings = settingsState.distance;
  const polylineSettings = settingsState.polyline;
  const setSettingsState = useCallback<
    Dispatch<SetStateAction<typeof settingsState>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousStoreState) => {
        const nextSettingsState = resolveSetStateAction(
          nextValueOrUpdater,
          previousStoreState.settingsState
        );

        return Object.is(nextSettingsState, previousStoreState.settingsState)
          ? previousStoreState
          : {
              ...previousStoreState,
              settingsState: nextSettingsState,
            };
      });
    },
    [annotationsStore]
  );
  const setPointSettings = useCallback<
    Dispatch<SetStateAction<typeof pointSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextPointSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.point
        );

        return Object.is(nextPointSettings, previousState.point)
          ? previousState
          : {
              ...previousState,
              point: nextPointSettings,
            };
      });
    },
    [setSettingsState]
  );
  const setDistanceSettings = useCallback<
    Dispatch<SetStateAction<typeof distanceSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextDistanceSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.distance
        );

        return Object.is(nextDistanceSettings, previousState.distance)
          ? previousState
          : {
              ...previousState,
              distance: nextDistanceSettings,
            };
      });
    },
    [setSettingsState]
  );
  const setPolylineSettings = useCallback<
    Dispatch<SetStateAction<typeof polylineSettings>>
  >(
    (nextValueOrUpdater) => {
      setSettingsState((previousState) => {
        const nextPolylineSettings = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.polyline
        );

        return Object.is(nextPolylineSettings, previousState.polyline)
          ? previousState
          : {
              ...previousState,
              polyline: nextPolylineSettings,
            };
      });
    },
    [setSettingsState]
  );
  const showLabels = useStoreSelector(
    annotationsStore,
    (state) => state.showLabels
  );
  const occlusionChecksEnabled = useStoreSelector(
    annotationsStore,
    (state) => state.occlusionChecksEnabled
  );
  const [hideMeasurementsOfType, setHideMeasurementsOfType] = useState<
    Set<AnnotationMode>
  >(new Set());
  const [hideLabelsOfType, setHideLabelsOfType] = useState<Set<AnnotationMode>>(
    new Set()
  );
  const isSceneReady = Boolean(scene && !scene.isDestroyed());
  const [polylines, setPolylines] = useState<DerivedPolylinePath[]>([]);
  const pointRadius = pointQuerySettings.radius;
  const pointVerticalOffsetMeters = pointSettings.verticalOffsetMeters;
  const pointTemporaryMode = pointSettings.temporaryMode;
  const defaultPolylineVerticalOffsetMeters =
    polylineSettings.defaultVerticalOffsetMeters;
  const defaultPolylineSegmentLineMode =
    polylineSettings.defaultSegmentLineMode;
  const distanceModeStickyToFirstPoint = distanceSettings.stickyToFirstPoint;
  const distanceCreationLineVisibility =
    distanceSettings.creationLineVisibility;
  const heightOffset = pointQuerySettings.heightOffset;
  const setPointVerticalOffsetMeters = useCallback<
    Dispatch<SetStateAction<number>>
  >(
    (nextValueOrUpdater) => {
      setPointSettings((previousState) => {
        const nextVerticalOffsetMeters =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.verticalOffsetMeters)
            : nextValueOrUpdater;

        return nextVerticalOffsetMeters === previousState.verticalOffsetMeters
          ? previousState
          : {
              ...previousState,
              verticalOffsetMeters: nextVerticalOffsetMeters,
            };
      });
    },
    [setPointSettings]
  );
  const setPointTemporaryMode = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValueOrUpdater) => {
      setPointSettings((previousState) => {
        const nextTemporaryMode =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.temporaryMode)
            : nextValueOrUpdater;

        return nextTemporaryMode === previousState.temporaryMode
          ? previousState
          : {
              ...previousState,
              temporaryMode: nextTemporaryMode,
            };
      });
    },
    [setPointSettings]
  );
  const setDefaultPolylineVerticalOffsetMeters = useCallback<
    Dispatch<SetStateAction<number>>
  >(
    (nextValueOrUpdater) => {
      setPolylineSettings((previousState) => {
        const nextDefaultVerticalOffsetMeters =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.defaultVerticalOffsetMeters)
            : nextValueOrUpdater;

        return nextDefaultVerticalOffsetMeters ===
          previousState.defaultVerticalOffsetMeters
          ? previousState
          : {
              ...previousState,
              defaultVerticalOffsetMeters: nextDefaultVerticalOffsetMeters,
            };
      });
    },
    [setPolylineSettings]
  );
  const setDefaultPolylineSegmentLineMode = useCallback<
    Dispatch<SetStateAction<LinearSegmentLineMode>>
  >(
    (nextValueOrUpdater) => {
      setPolylineSettings((previousState) => {
        const nextDefaultSegmentLineMode =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.defaultSegmentLineMode)
            : nextValueOrUpdater;

        return nextDefaultSegmentLineMode ===
          previousState.defaultSegmentLineMode
          ? previousState
          : {
              ...previousState,
              defaultSegmentLineMode: nextDefaultSegmentLineMode,
            };
      });
    },
    [setPolylineSettings]
  );
  const setDistanceModeStickyToFirstPoint = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (nextValueOrUpdater) => {
      setDistanceSettings((previousState) => {
        const nextStickyToFirstPoint =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.stickyToFirstPoint)
            : nextValueOrUpdater;

        return nextStickyToFirstPoint === previousState.stickyToFirstPoint
          ? previousState
          : {
              ...previousState,
              stickyToFirstPoint: nextStickyToFirstPoint,
            };
      });
    },
    [setDistanceSettings]
  );
  const setDistanceCreationLineVisibility = useCallback<
    Dispatch<
      SetStateAction<{
        direct: boolean;
        vertical: boolean;
        horizontal: boolean;
      }>
    >
  >(
    (nextValueOrUpdater) => {
      setDistanceSettings((previousState) => {
        const nextCreationLineVisibility =
          typeof nextValueOrUpdater === "function"
            ? nextValueOrUpdater(previousState.creationLineVisibility)
            : nextValueOrUpdater;

        return Object.is(
          nextCreationLineVisibility,
          previousState.creationLineVisibility
        )
          ? previousState
          : {
              ...previousState,
              creationLineVisibility: nextCreationLineVisibility,
            };
      });
    },
    [setDistanceSettings]
  );
  const {
    createdPointIds,
    createdRelationIds,
    clearMeasurementDraftSession,
    trackMeasurementDraftPointIds,
    trackMeasurementDraftRelationId,
    pruneMeasurementDraftSession,
  } = useMeasurementDraftRollbackState(annotationsStore);
  const activePlanarMeasurementId = useStoreSelector(
    annotationsStore,
    (state) => state.activePlanarMeasurementId
  );
  const pendingPolylinePromotionRingClosurePointId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingPolylineRingPromotionPointId
  );
  const labelInputPromptPointId = useStoreSelector(
    annotationsStore,
    (state) => state.pendingLabelPlacementAnnotationId
  );
  const doubleClickChainSourcePointId = useStoreSelector(
    annotationsStore,
    (state) => state.openChainPointId
  );
  const setActivePlanarMeasurementId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextActivePlanarMeasurementId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.activePlanarMeasurementId
        );

        return nextActivePlanarMeasurementId ===
          previousState.activePlanarMeasurementId
          ? previousState
          : {
              ...previousState,
              activePlanarMeasurementId: nextActivePlanarMeasurementId,
            };
      });
    },
    [annotationsStore]
  );
  const clearActivePlanarMeasurement = useCallback(() => {
    setActivePlanarMeasurementId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setActivePlanarMeasurementId]);
  const setPendingPolylinePromotionRingClosurePointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextPendingPolylineRingPromotionPointId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.pendingPolylineRingPromotionPointId
        );

        return nextPendingPolylineRingPromotionPointId ===
          previousState.pendingPolylineRingPromotionPointId
          ? previousState
          : {
              ...previousState,
              pendingPolylineRingPromotionPointId:
                nextPendingPolylineRingPromotionPointId,
            };
      });
    },
    [annotationsStore]
  );
  const clearPendingPolylineRingPromotion = useCallback(() => {
    setPendingPolylinePromotionRingClosurePointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setPendingPolylinePromotionRingClosurePointId]);
  const setLabelInputPromptPointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextPendingLabelPlacementAnnotationId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.pendingLabelPlacementAnnotationId
        );

        return nextPendingLabelPlacementAnnotationId ===
          previousState.pendingLabelPlacementAnnotationId
          ? previousState
          : {
              ...previousState,
              pendingLabelPlacementAnnotationId:
                nextPendingLabelPlacementAnnotationId,
            };
      });
    },
    [annotationsStore]
  );
  const clearPendingLabelPlacementAnnotation = useCallback(() => {
    setLabelInputPromptPointId((previousId) =>
      previousId === null ? previousId : null
    );
  }, [setLabelInputPromptPointId]);
  const setDoubleClickChainSourcePointId = useCallback<
    Dispatch<SetStateAction<string | null>>
  >(
    (nextValueOrUpdater) => {
      annotationsStore.setState((previousState) => {
        const nextOpenChainPointId = resolveSetStateAction(
          nextValueOrUpdater,
          previousState.openChainPointId
        );

        return nextOpenChainPointId === previousState.openChainPointId
          ? previousState
          : {
              ...previousState,
              openChainPointId: nextOpenChainPointId,
            };
      });
    },
    [annotationsStore]
  );
  const { pointEntries, pointMeasureEntries, selectablePointIds } =
    usePointMeasurementCollections(annotations);
  const {
    selectedAnnotationId,
    selectedAnnotationIds,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    selectModeRectangle,
    setSelectModeRectangle,
    effectiveSelectModeAdditive,
    annotationSelection,
    rectangleSelection,
    selectedDistancePair,
    selectAnnotationIds: selectAnnotationIdsBase,
    selectAnnotationById: selectAnnotationByIdBase,
    selectAnnotationByIdImmediate: selectAnnotationByIdImmediateBase,
    clearPointSelection,
    clearAnnotationSelection: clearPointAnnotationSelection,
    pruneSelectionByRemovedIds,
  } = useAnnotationSelection(annotationsStore, scene, selectablePointIds);
  const selectAnnotationIds = selectAnnotationIdsBase;
  const selectAnnotationById = selectAnnotationByIdBase;
  const selectAnnotationByIdImmediate = selectAnnotationByIdImmediateBase;
  const clearAnnotationSelection = clearPointAnnotationSelection;
  const {
    getOwnerGroupIdsForPointId,
    getOwnerGroupIdsForEdgeRelationId,
    getRepresentativePointIdForGroupId,
  } = useMeasurementOwnershipIndex(planarPolygonGroups);
  const focusedSelectedPlanarMeasurementId = useMemo(() => {
    if (selectedAnnotationId) {
      return getOwnerGroupIdsForPointId(selectedAnnotationId)[0] ?? null;
    }

    for (const selectedId of selectedAnnotationIds) {
      const ownerGroupId = getOwnerGroupIdsForPointId(selectedId)[0] ?? null;
      if (ownerGroupId) {
        return ownerGroupId;
      }
    }

    return null;
  }, [getOwnerGroupIdsForPointId, selectedAnnotationId, selectedAnnotationIds]);

  const {
    moveGizmoAxisDirection,
    moveGizmoAxisTitle,
    moveGizmoAxisCandidates,
    moveGizmoPreferredAxisId,
    moveGizmoVerticalOffsetEditMode,
    moveGizmoVerticalOffsetPlanarMeasurementId,
    activeEditTarget,
    setActiveEditTarget,
    clearActiveEditTarget,
    moveGizmoPointId,
    isMoveGizmoDragging,
    setIsMoveGizmoDragging,
    startMoveGizmoForMeasurementId,
    clearMoveGizmo,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit,
  } = useAnnotationEditState(annotationsStore, annotations);
  const {
    updatePointMeasurementPositionById,
    setPointAnnotationElevationById,
    setPointAnnotationCoordinatesById,
    setMoveGizmoPointElevationFromMeasurementById,
    handleMoveGizmoPointPositionChange,
  } = usePointEditingState(
    annotations,
    planarPolygonGroups,
    referencePoint,
    selectedAnnotationIds,
    {
      setAnnotations,
      setPlanarMeasurements,
      setReferencePoint,
      moveGizmoPointId,
      moveGizmoAxisDirection,
      moveGizmoAxisCandidates,
      moveGizmoVerticalOffsetEditMode,
      moveGizmoVerticalOffsetPlanarMeasurementId,
    }
  );

  const geometryPointsTable = useMemo(
    () => buildPointGeometryRows(annotations.filter(isPointAnnotationEntry)),
    [annotations]
  );
  const geometryNodeTable = useMemo(
    () =>
      geometryPointsTable.reduce<Record<string, AnnotationGeometryPoint>>(
        (table, node) => {
          table[node.id] = node;
          return table;
        },
        {}
      ),
    [geometryPointsTable]
  );
  const geometryEdgesTable = useMemo(
    () => buildGeometryEdgeTable(distanceRelations, planarPolygonGroups),
    [distanceRelations, planarPolygonGroups]
  );
  const planarPolygonGroupVerticesTable = useMemo(
    () => buildPolygonGroupVertexTable(planarPolygonGroups),
    [planarPolygonGroups]
  );

  const hasAppliedInitialPersistenceStateRef = useRef(false);
  const lastSavedPersistenceStateRef = useRef<string | null>(null);

  useEffect(
    function effectApplyInitialPersistenceState() {
      if (!isSceneReady || hasAppliedInitialPersistenceStateRef.current) {
        return;
      }

      if (initialPersistenceState) {
        setTimeout(() => {
          setAnnotations(initialPersistenceState.tables.annotations);
          setDistanceRelations(
            initialPersistenceState.tables.distanceRelations.map(
              withDistanceRelationEdgeId
            )
          );
          setPlanarMeasurements(
            initialPersistenceState.tables.planarPolygonGroups
          );
        }, PERSISTENCE_RESTORE_DELAY_MS);
      }

      hasAppliedInitialPersistenceStateRef.current = true;
    },
    [initialPersistenceState, isSceneReady, setAnnotations]
  );

  useEffect(
    function effectBackfillMissingSegmentLineModes() {
      setPlanarMeasurements((prev) => {
        let hasChanges = false;
        const nextGroups = prev.map((group) => {
          if (group.segmentLineMode) {
            return group;
          }
          hasChanges = true;
          return {
            ...group,
            segmentLineMode: group.closed
              ? LINEAR_SEGMENT_LINE_MODE_DIRECT
              : defaultPolylineSegmentLineMode,
          };
        });
        return hasChanges ? nextGroups : prev;
      });
    },
    [defaultPolylineSegmentLineMode]
  );

  useEffect(
    function effectEmitPersistenceStateChanges() {
      if (
        !onPersistenceStateChange ||
        !hasAppliedInitialPersistenceStateRef.current
      ) {
        return;
      }

      const persistenceState: AnnotationPersistenceEnvelopeV2 = {
        version: 2,
        geometry: {
          points: geometryPointsTable,
          edges: geometryEdgesTable,
        },
        tables: {
          annotations,
          distanceRelations: distanceRelations.map(withDistanceRelationEdgeId),
          planarPolygonGroups,
          planarPolygonGroupVertices: planarPolygonGroupVerticesTable,
        },
      };

      const serialized = JSON.stringify(persistenceState);
      if (serialized === lastSavedPersistenceStateRef.current) {
        return;
      }

      onPersistenceStateChange(persistenceState);
      lastSavedPersistenceStateRef.current = serialized;
    },
    [
      distanceRelations,
      geometryEdgesTable,
      geometryPointsTable,
      annotations,
      onPersistenceStateChange,
      planarPolygonGroupVerticesTable,
      planarPolygonGroups,
    ]
  );

  const referenceElevation = useMemo(() => {
    if (!referencePoint || !scene) return 0;
    const cartographic =
      scene.globe.ellipsoid.cartesianToCartographic(referencePoint);
    return cartographic?.height ?? 0;
  }, [referencePoint, scene]);

  const derivedPolylines = useMemo(() => {
    return buildDerivedPolylinePaths({
      annotations,
      planarPolygonGroups,
      defaultVerticalOffsetMeters: defaultPolylineVerticalOffsetMeters,
      useOffsetAnchors: polylineVerticalOffsetVisualOnly,
    });
  }, [
    defaultPolylineVerticalOffsetMeters,
    annotations,
    planarPolygonGroups,
    polylineVerticalOffsetVisualOnly,
  ]);

  useEffect(
    function effectSyncDerivedPolylines() {
      setPolylines(derivedPolylines);
    },
    [derivedPolylines]
  );

  const focusedPlanarMeasurementId =
    focusedSelectedPlanarMeasurementId ?? activePlanarMeasurementId;
  const {
    focusedPolylineDistanceToStartByPointId,
    cumulativeDistanceByRelationId,
    effectiveReferenceElevation,
    effectiveDistanceToReferenceByPointId,
    unfocusedPolylineNonLastIds,
  } = useAnnotationsPolylineState(annotations, polylines, {
    focusedPlanarMeasurementId,
    referencePoint,
    referenceElevation,
  });
  const { unselectedClosedAreaNodeIdSet } = useClosedAreaSelectionState(
    planarPolygonGroups,
    focusedPlanarMeasurementId,
    activePlanarMeasurementId
  );
  const polylineVerticalOffsetMeters = useMemo(() => {
    if (!focusedPlanarMeasurementId) {
      return defaultPolylineVerticalOffsetMeters;
    }
    const focusedGroup = planarPolygonGroups.find(
      (group) => group.id === focusedPlanarMeasurementId
    );
    return (
      focusedGroup?.verticalOffsetMeters ?? defaultPolylineVerticalOffsetMeters
    );
  }, [
    defaultPolylineVerticalOffsetMeters,
    focusedPlanarMeasurementId,
    planarPolygonGroups,
  ]);
  const setPolylineVerticalOffsetMeters = useCallback<
    Dispatch<SetStateAction<number>>
  >(
    (nextOffsetOrUpdater) => {
      const nextOffsetMeters =
        typeof nextOffsetOrUpdater === "function"
          ? nextOffsetOrUpdater(polylineVerticalOffsetMeters)
          : nextOffsetOrUpdater;

      if (!Number.isFinite(nextOffsetMeters)) {
        return;
      }

      if (Math.abs(nextOffsetMeters - polylineVerticalOffsetMeters) <= 1e-9) {
        return;
      }

      setDefaultPolylineVerticalOffsetMeters(nextOffsetMeters);

      if (!focusedPlanarMeasurementId) {
        return;
      }

      const focusedGroup = planarPolygonGroups.find(
        (group) => group.id === focusedPlanarMeasurementId
      );
      if (!focusedGroup) {
        return;
      }

      setPlanarMeasurements((prev) =>
        prev.map((group) =>
          group.id === focusedPlanarMeasurementId
            ? {
                ...group,
                verticalOffsetMeters: nextOffsetMeters,
              }
            : group
        )
      );

      const focusedVertexIdSet = new Set(focusedGroup.nodeIds);
      if (focusedVertexIdSet.size === 0) {
        return;
      }

      setAnnotations((prev) =>
        prev.map((measurement) => {
          if (
            !isPointAnnotationEntry(measurement) ||
            !focusedVertexIdSet.has(measurement.id) ||
            !measurement.verticalOffsetAnchorECEF
          ) {
            return measurement;
          }

          const anchorECEF = new Cartesian3(
            measurement.verticalOffsetAnchorECEF.x,
            measurement.verticalOffsetAnchorECEF.y,
            measurement.verticalOffsetAnchorECEF.z
          );
          const nextPointPosition = getPositionWithVerticalOffsetFromAnchor(
            anchorECEF,
            nextOffsetMeters
          );
          const nextWGS84 = getDegreesFromCartesian(nextPointPosition);

          return {
            ...measurement,
            geometryECEF: nextPointPosition,
            geometryWGS84: {
              longitude: nextWGS84.longitude,
              latitude: nextWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(nextWGS84.altitude),
            },
          };
        })
      );
    },
    [
      focusedPlanarMeasurementId,
      planarPolygonGroups,
      polylineVerticalOffsetMeters,
      setAnnotations,
    ]
  );
  const activeToolType = useMemo(
    () => (selectionModeActive ? SELECT_TOOL_TYPE : annotationToolType),
    [annotationToolType, selectionModeActive]
  );

  const annotationCandidateDescriptor =
    useMemo<AnnotationCandidateDescriptor>(() => {
      if (activeToolType === ANNOTATION_TYPE_POINT) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POINT,
          verticalOffsetMeters: pointVerticalOffsetMeters,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_LABEL) {
        if (labelInputPromptPointId) {
          return {
            kind: ANNOTATION_CANDIDATE_KIND_NONE,
            verticalOffsetMeters: 0,
          };
        }
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POINT,
          verticalOffsetMeters: 0,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_DISTANCE) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_DISTANCE,
          verticalOffsetMeters: 0,
        };
      }

      if (activeToolType === ANNOTATION_TYPE_POLYLINE) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYLINE,
          verticalOffsetMeters: polylineVerticalOffsetMeters,
        };
      }

      if (
        activeToolType !== ANNOTATION_TYPE_AREA_GROUND &&
        activeToolType !== ANNOTATION_TYPE_AREA_VERTICAL &&
        activeToolType !== ANNOTATION_TYPE_AREA_PLANAR
      ) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_NONE,
          verticalOffsetMeters: 0,
        };
      }

      const activeOpenPolygonGroup = activePlanarMeasurementId
        ? planarPolygonGroups.find(
            (group) => group.id === activePlanarMeasurementId && !group.closed
          ) ?? null
        : null;
      const effectiveType = activeOpenPolygonGroup?.type ?? activeToolType;

      if (effectiveType === ANNOTATION_TYPE_AREA_VERTICAL) {
        const firstNodeId =
          activeOpenPolygonGroup?.nodeIds.length === 1
            ? activeOpenPolygonGroup.nodeIds[0]
            : null;
        if (firstNodeId && activeOpenPolygonGroup) {
          return {
            kind: ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
            verticalOffsetMeters: 0,
            verticalPolygonContext: {
              groupId: activeOpenPolygonGroup.id,
              firstNodeId,
            },
          };
        }
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_VERTICAL,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveType === ANNOTATION_TYPE_AREA_GROUND) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_GROUND,
          verticalOffsetMeters: 0,
        };
      }

      if (effectiveType === ANNOTATION_TYPE_AREA_PLANAR) {
        return {
          kind: ANNOTATION_CANDIDATE_KIND_POLYGON_PLANAR,
          verticalOffsetMeters: 0,
        };
      }

      return {
        kind: ANNOTATION_CANDIDATE_KIND_NONE,
        verticalOffsetMeters: 0,
      };
    }, [
      activeToolType,
      activePlanarMeasurementId,
      labelInputPromptPointId,
      planarPolygonGroups,
      pointVerticalOffsetMeters,
      polylineVerticalOffsetMeters,
    ]);

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
  } = useAnnotationCandidateState(
    scene,
    annotations,
    annotationCandidateDescriptor,
    {
      pointQueryEnabled,
      moveGizmoPointId,
      isMoveGizmoDragging,
      setPlanarMeasurements,
      getPositionWithVerticalOffsetFromAnchor,
    }
  );
  const polylineSegmentLineMode = useMemo(() => {
    if (!activePlanarMeasurementId) {
      return defaultPolylineSegmentLineMode;
    }
    const activeGroup = planarPolygonGroups.find(
      (group) => group.id === activePlanarMeasurementId
    );
    return activeGroup?.segmentLineMode ?? defaultPolylineSegmentLineMode;
  }, [
    activePlanarMeasurementId,
    defaultPolylineSegmentLineMode,
    planarPolygonGroups,
  ]);
  const setPolylineSegmentLineMode = useCallback<
    Dispatch<SetStateAction<LinearSegmentLineMode>>
  >(
    (nextModeOrUpdater) => {
      const nextMode =
        typeof nextModeOrUpdater === "function"
          ? nextModeOrUpdater(polylineSegmentLineMode)
          : nextModeOrUpdater;

      if (!nextMode || nextMode === polylineSegmentLineMode) {
        return;
      }

      setDefaultPolylineSegmentLineMode(nextMode);

      if (!activePlanarMeasurementId) {
        return;
      }

      setPlanarMeasurements((prev) =>
        prev.map((group) =>
          group.id === activePlanarMeasurementId
            ? {
                ...group,
                segmentLineMode: nextMode,
              }
            : group
        )
      );
    },
    [activePlanarMeasurementId, polylineSegmentLineMode]
  );
  const { pointMarkerBadgeByPointId } = usePointMarkerBadgeState(
    pointEntries,
    pointMeasureEntries,
    planarPolygonGroups,
    distanceRelations
  );
  const standaloneDistancePointState = useStandaloneDistancePointState(
    pointEntries,
    distanceRelations,
    selectedAnnotationId,
    selectedAnnotationIds
  );
  const {
    unfocusedStandaloneDistanceNonHighestPointIds,
    focusedStandaloneDistanceNonHighestPointIds,
  } = standaloneDistancePointState;
  const desiredPointLabelAnchorById = usePointLabelAnchorState(
    pointEntries,
    polylines,
    focusedPlanarMeasurementId,
    pointMarkerBadgeByPointId,
    standaloneDistancePointState
  );
  useSyncPointLabelAnchors(setAnnotations, desiredPointLabelAnchorById);
  const {
    collapsedPillPointIds,
    pointIdsWithoutLabelAnchor,
    labelAnchorPointIdsWithForcedVisibility,
  } = usePointLabelVisibilityState(pointEntries, unselectedClosedAreaNodeIdSet);
  const { lastCustomPointAnnotationName } =
    useAnnotationCreateDefaults(annotations);
  const { showPoints, showPointLabels } = usePointVisibilityState(
    hideMeasurementsOfType,
    showLabels,
    hideLabelsOfType
  );
  const lockedMeasurementIdSet = useLockedMeasurementIdSet(annotations);
  const showDistanceAndPolygonVisuals = true;

  const clearActivePlanarDrawingState = useCallback(() => {
    clearActivePlanarMeasurement();
    setDoubleClickChainSourcePointId(null);
    clearMeasurementDraftSession();
  }, [clearActivePlanarMeasurement, clearMeasurementDraftSession]);

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

      clearActivePlanarDrawingState();
      clearMoveGizmo();
      selectAnnotationById(representativePointId);
    },
    [
      clearActivePlanarDrawingState,
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

      const isPlanarMeasurementId = planarPolygonGroups.some(
        (group) => group.id === id
      );
      if (isPlanarMeasurementId) {
        selectRepresentativeNodeForMeasurementId(id);
        return;
      }

      selectAnnotationById(id);
    },
    [
      clearAnnotationSelection,
      selectRepresentativeNodeForMeasurementId,
      planarPolygonGroups,
      selectAnnotationById,
    ]
  );

  const finishDistanceMeasurementSession = useCallback(
    (selectedPointId: string | null, immediateSelection: boolean = false) => {
      clearMeasurementDraftSession();
      setDoubleClickChainSourcePointId(null);
      if (selectedPointId === null) {
        return;
      }

      if (immediateSelection) {
        selectAnnotationByIdImmediate(selectedPointId);
        return;
      }

      selectAnnotationById(selectedPointId);
    },
    [
      clearMeasurementDraftSession,
      selectAnnotationById,
      selectAnnotationByIdImmediate,
    ]
  );

  const discardActiveMeasurementDraft = useCallback(
    (activeGroupId: string | null) => {
      const createdPointIdSet = new Set(createdPointIds);
      const createdRelationIdSet = new Set(createdRelationIds);

      if (activeGroupId) {
        setPlanarMeasurements((previousGroups) =>
          previousGroups.filter((group) => group.id !== activeGroupId)
        );
      }

      if (createdRelationIdSet.size > 0) {
        setDistanceRelations((previousRelations) =>
          previousRelations.filter(
            (relation) => !createdRelationIdSet.has(relation.id)
          )
        );
      }

      if (createdPointIdSet.size > 0) {
        setAnnotations((previousAnnotations) =>
          previousAnnotations.filter(
            (annotation) => !createdPointIdSet.has(annotation.id)
          )
        );
        pruneSelectionByRemovedIds(createdPointIdSet);

        if (moveGizmoPointId && createdPointIdSet.has(moveGizmoPointId)) {
          clearMoveGizmo();
        }

        setLabelInputPromptPointId((previousPromptPointId) =>
          previousPromptPointId && createdPointIdSet.has(previousPromptPointId)
            ? null
            : previousPromptPointId
        );
      }

      clearAnnotationCursor();
      clearAnnotationSelection();
      clearActivePlanarDrawingState();
      clearMoveGizmo();
      setPendingPolylinePromotionRingClosurePointId(null);
      setLabelInputPromptPointId(null);
    },
    [
      clearActivePlanarDrawingState,
      clearAnnotationCursor,
      clearAnnotationSelection,
      clearMoveGizmo,
      createdPointIds,
      createdRelationIds,
      moveGizmoPointId,
      pruneSelectionByRemovedIds,
    ]
  );

  // Internal drawing-session signal for an active open polyline/polygon chain.
  const isActiveDrawMode = useMemo(() => {
    if (!doubleClickChainSourcePointId) return false;
    if (!selectablePointIds.has(doubleClickChainSourcePointId)) return false;
    if (!activePlanarMeasurementId) return false;
    return planarPolygonGroups.some(
      (group) => group.id === activePlanarMeasurementId && !group.closed
    );
  }, [
    activePlanarMeasurementId,
    doubleClickChainSourcePointId,
    planarPolygonGroups,
    selectablePointIds,
  ]);

  const selectedDistanceRelation = useMemo(() => {
    if (!selectedDistancePair) return null;
    return (
      distanceRelations.find((relation) =>
        isSameDistanceRelationPair(
          relation,
          selectedDistancePair.activePointId,
          selectedDistancePair.previousPointId
        )
      ) ?? null
    );
  }, [distanceRelations, selectedDistancePair]);

  const showSelectedReferenceLine =
    selectedDistanceRelation?.showDirectLine ?? false;
  const selectedVerticalLineVisible =
    selectedDistanceRelation?.showVerticalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const selectedHorizontalLineVisible =
    selectedDistanceRelation?.showHorizontalLine ??
    selectedDistanceRelation?.showComponentLines ??
    false;
  const showSelectedReferenceLineComponents =
    selectedVerticalLineVisible || selectedHorizontalLineVisible;

  const referencePointMeasurementId = useMemo(() => {
    if (!referencePoint) return null;
    const pointMeasurement = annotations.find(
      (measurement) =>
        isPointAnnotationEntry(measurement) &&
        Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          REFERENCE_POINT_SYNC_EPSILON_METERS
    );
    return pointMeasurement && isPointAnnotationEntry(pointMeasurement)
      ? pointMeasurement.id
      : null;
  }, [annotations, referencePoint]);

  const resolveDistanceRelationSourcePointId = useCallback(
    (targetPointId: string) => {
      if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
        return referencePointMeasurementId === targetPointId
          ? null
          : referencePointMeasurementId;
      }
      const hasChainSource = Boolean(
        doubleClickChainSourcePointId &&
          selectablePointIds.has(doubleClickChainSourcePointId)
      );
      if (!hasChainSource) return null;
      return doubleClickChainSourcePointId === targetPointId
        ? null
        : doubleClickChainSourcePointId;
    },
    [
      distanceModeStickyToFirstPoint,
      doubleClickChainSourcePointId,
      selectablePointIds,
      referencePointMeasurementId,
    ]
  );

  const setDistanceCreationLineVisibilityByKind = useCallback(
    (kind: "direct" | "vertical" | "horizontal", visible: boolean) => {
      setDistanceCreationLineVisibility((prev) =>
        prev[kind] === visible
          ? prev
          : {
              ...prev,
              [kind]: visible,
            }
      );
    },
    []
  );

  const candidateAnchorPointId = useMemo(() => {
    if (!candidateSupportsEdgeLine) return null;
    return resolveDistanceRelationSourcePointId("__candidate-target__");
  }, [candidateSupportsEdgeLine, resolveDistanceRelationSourcePointId]);

  const hasDistancePreviewAnchor = useMemo(() => {
    if (activeToolType !== ANNOTATION_TYPE_DISTANCE) {
      return false;
    }

    if (distanceModeStickyToFirstPoint && referencePointMeasurementId) {
      return true;
    }

    return Boolean(
      doubleClickChainSourcePointId &&
        selectablePointIds.has(doubleClickChainSourcePointId)
    );
  }, [
    activeToolType,
    distanceModeStickyToFirstPoint,
    doubleClickChainSourcePointId,
    selectablePointIds,
    referencePointMeasurementId,
  ]);

  const activeMeasurementId = useMemo(() => {
    if (moveGizmoPointId && selectablePointIds.has(moveGizmoPointId)) {
      return moveGizmoPointId;
    }

    if (candidateAnchorPointId) {
      return candidateAnchorPointId;
    }

    if (
      doubleClickChainSourcePointId &&
      selectablePointIds.has(doubleClickChainSourcePointId)
    ) {
      return doubleClickChainSourcePointId;
    }

    if (selectedAnnotationId && selectablePointIds.has(selectedAnnotationId)) {
      return selectedAnnotationId;
    }

    return null;
  }, [
    candidateAnchorPointId,
    doubleClickChainSourcePointId,
    moveGizmoPointId,
    selectablePointIds,
    selectedAnnotationId,
  ]);

  const { candidateConnectionPreview, candidatePreviewDistanceMeters } =
    useMemo<{
      candidateConnectionPreview: CandidateConnectionPreview | null;
      candidatePreviewDistanceMeters: number | undefined;
    }>(() => {
      if (!activeCandidateNodeECEF || !candidateAnchorPointId) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      const sourcePoint = getPointById(annotations, candidateAnchorPointId);
      if (!sourcePoint || !isPointAnnotationEntry(sourcePoint)) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      const showDirectLine = candidateForcesDirectEdgeLine
        ? true
        : candidateUsesPolylineEdgeRules
        ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT
        : distanceCreationLineVisibility.direct;
      const showComponentLines = candidateForcesDirectEdgeLine
        ? false
        : candidateUsesPolylineEdgeRules
        ? polylineSegmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS
        : distanceCreationLineVisibility.vertical ||
          distanceCreationLineVisibility.horizontal;
      const showVerticalLine = candidateUsesPolylineEdgeRules
        ? showComponentLines
        : distanceCreationLineVisibility.vertical;
      const showHorizontalLine = candidateUsesPolylineEdgeRules
        ? showComponentLines
        : distanceCreationLineVisibility.horizontal;

      if (!showDirectLine && !showVerticalLine && !showHorizontalLine) {
        return {
          candidateConnectionPreview: null,
          candidatePreviewDistanceMeters: undefined,
        };
      }

      return {
        candidateConnectionPreview: {
          anchorPointECEF: Cartesian3.clone(sourcePoint.geometryECEF),
          targetPointECEF: Cartesian3.clone(activeCandidateNodeECEF),
          showDirectLine,
          showVerticalLine,
          showHorizontalLine,
        },
        candidatePreviewDistanceMeters: isPolylineCandidateMode
          ? (focusedPolylineDistanceToStartByPointId[candidateAnchorPointId] ??
              0) +
            Cartesian3.distance(
              sourcePoint.geometryECEF,
              activeCandidateNodeECEF
            )
          : undefined,
      };
    }, [
      distanceCreationLineVisibility.direct,
      distanceCreationLineVisibility.horizontal,
      distanceCreationLineVisibility.vertical,
      activeCandidateNodeECEF,
      candidateAnchorPointId,
      candidateForcesDirectEdgeLine,
      candidateUsesPolylineEdgeRules,
      isPolylineCandidateMode,
      focusedPolylineDistanceToStartByPointId,
      annotations,
      polylineSegmentLineMode,
    ]);

  const handlePointQueryBeforePointCreate = useCallback(
    (_positionECEF: Cartesian3 | null, screenPosition: Cartesian2) => {
      // Check if click hit a polygon fill primitive
      if (scene && !scene.isDestroyed()) {
        const picked = scene.pick(screenPosition);
        const pickedPolygonGroupId = picked?.id?.polygonGroupId;
        if (pickedPolygonGroupId) {
          selectRepresentativeNodeForMeasurementId(pickedPolygonGroupId);
          return false;
        }
      }

      if (isActiveDrawMode) {
        return true;
      }

      if (focusedSelectedPlanarMeasurementId) {
        selectRepresentativeNodeForMeasurementId(null);
        if (
          activeToolType === ANNOTATION_TYPE_POLYLINE ||
          isAreaToolType(activeToolType)
        ) {
          return true;
        }
        return false;
      }

      return true;
    },
    [
      activeToolType,
      selectRepresentativeNodeForMeasurementId,
      focusedSelectedPlanarMeasurementId,
      scene,
      isActiveDrawMode,
    ]
  );

  useEffect(
    function effectBindPolygonFillSelectionClickHandler() {
      if (!scene || scene.isDestroyed() || !selectionModeActive) {
        return;
      }

      const clickHandler = new ScreenSpaceEventHandler(scene.canvas);
      clickHandler.setInputAction((event) => {
        const screenPosition = event.position;
        if (!screenPosition) return;

        const picked = scene.pick(screenPosition);
        if (!picked) {
          selectAnnotationById(null);
          return;
        }
        const pickedPolygonGroupId = picked?.id?.polygonGroupId;
        if (typeof pickedPolygonGroupId !== "string") return;
        if (!pickedPolygonGroupId.trim()) return;

        selectRepresentativeNodeForMeasurementId(pickedPolygonGroupId);
      }, ScreenSpaceEventType.LEFT_CLICK);

      return () => {
        clickHandler.destroy();
      };
    },
    [
      scene,
      selectionModeActive,
      selectRepresentativeNodeForMeasurementId,
      selectAnnotationById,
    ]
  );

  const upsertDirectDistanceRelation = useCallback(
    (sourcePointId: string, targetPointId: string) => {
      if (!sourcePointId || !targetPointId || sourcePointId === targetPointId) {
        return;
      }

      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, sourcePointId, targetPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(sourcePointId, targetPointId),
                edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
                pointAId: sourcePointId,
                pointBId: targetPointId,
                anchorPointId: sourcePointId,
                showDirectLine: distanceCreationLineVisibility.direct,
                showVerticalLine: distanceCreationLineVisibility.vertical,
                showHorizontalLine: distanceCreationLineVisibility.horizontal,
                showComponentLines:
                  distanceCreationLineVisibility.vertical ||
                  distanceCreationLineVisibility.horizontal,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(sourcePointId, targetPointId),
          anchorPointId: sourcePointId,
          showDirectLine:
            relation.showDirectLine ?? distanceCreationLineVisibility.direct,
          showVerticalLine:
            relation.showVerticalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.vertical,
          showHorizontalLine:
            relation.showHorizontalLine ??
            relation.showComponentLines ??
            distanceCreationLineVisibility.horizontal,
          showComponentLines:
            relation.showComponentLines ??
            relation.showVerticalLine ??
            relation.showHorizontalLine ??
            (distanceCreationLineVisibility.vertical ||
              distanceCreationLineVisibility.horizontal),
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
          directLabelMode:
            relation.directLabelMode ?? DEFAULT_DIRECT_LINE_LABEL_MODE,
        };

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [distanceCreationLineVisibility]
  );

  const syncPolygonEdgeDistanceRelations = useCallback(
    (
      prevRelations: PointDistanceRelation[],
      groups: PlanarMeasurementGroup[]
    ): PointDistanceRelation[] => {
      const desiredById = new Map<
        string,
        {
          groupId: string;
          pointAId: string;
          pointBId: string;
          showDirectLine: boolean;
          showComponentLines: boolean;
        }
      >();

      groups.forEach((group) => {
        if (group.nodeIds.length < 2) return;
        const isPolylineGroup = group.type === ANNOTATION_TYPE_POLYLINE;
        const segmentLineMode =
          group.segmentLineMode ??
          (isPolylineGroup
            ? defaultPolylineSegmentLineMode
            : LINEAR_SEGMENT_LINE_MODE_DIRECT);
        const showDirectLine = isPolylineGroup
          ? segmentLineMode === LINEAR_SEGMENT_LINE_MODE_DIRECT
          : true;
        const showComponentLines = isPolylineGroup
          ? segmentLineMode === LINEAR_SEGMENT_LINE_MODE_COMPONENTS
          : false;
        const orderedVertices = group.nodeIds;
        for (let index = 0; index < orderedVertices.length - 1; index += 1) {
          const pointAId = orderedVertices[index];
          const pointBId = orderedVertices[index + 1];
          if (!pointAId || !pointBId) continue;
          const relationId = getDistanceRelationId(pointAId, pointBId);
          desiredById.set(relationId, {
            groupId: group.id,
            pointAId,
            pointBId,
            showDirectLine,
            showComponentLines,
          });
        }
        if (group.closed && orderedVertices.length >= 3) {
          const first = orderedVertices[0];
          const last = orderedVertices[orderedVertices.length - 1];
          if (first && last) {
            const relationId = getDistanceRelationId(last, first);
            desiredById.set(relationId, {
              groupId: group.id,
              pointAId: last,
              pointBId: first,
              showDirectLine,
              showComponentLines,
            });
          }
        }
      });

      const next: PointDistanceRelation[] = [];
      const handledIds = new Set<string>();

      prevRelations.forEach((relation) => {
        const desired = desiredById.get(relation.id);
        if (!desired) {
          if (!relation.polygonGroupId) {
            next.push(relation);
          }
          return;
        }

        handledIds.add(relation.id);
        next.push({
          ...withDistanceRelationEdgeId(relation),
          edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: desired.showDirectLine,
          showVerticalLine: desired.showComponentLines,
          showHorizontalLine: desired.showComponentLines,
          showComponentLines: desired.showComponentLines,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
          directLabelMode:
            relation.directLabelMode ?? DEFAULT_DIRECT_LINE_LABEL_MODE,
        });
      });

      desiredById.forEach((desired, relationId) => {
        if (handledIds.has(relationId)) return;
        next.push({
          id: relationId,
          edgeId: getMeasurementEdgeId(desired.pointAId, desired.pointBId),
          pointAId: desired.pointAId,
          pointBId: desired.pointBId,
          anchorPointId: desired.pointAId,
          polygonGroupId: desired.groupId,
          showDirectLine: desired.showDirectLine,
          showVerticalLine: desired.showComponentLines,
          showHorizontalLine: desired.showComponentLines,
          showComponentLines: desired.showComponentLines,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
          },
          directLabelMode: DEFAULT_DIRECT_LINE_LABEL_MODE,
        });
      });

      return areDistanceRelationsEquivalent(
        prevRelations,
        next,
        DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY
      )
        ? prevRelations
        : next;
    },
    [defaultPolylineSegmentLineMode]
  );

  const handlePointMeasurePointCreated = useCallback(
    (newPointId: string) => {
      setDoubleClickChainSourcePointId(null);
      setActivePlanarMeasurementId(null);
      if (activeToolType === ANNOTATION_TYPE_LABEL) {
        setLabelInputPromptPointId(newPointId);
      }
      selectAnnotationByIdImmediate(newPointId);
    },
    [activeToolType, selectAnnotationByIdImmediate]
  );

  const confirmLabelPlacementById = useCallback((id: string) => {
    if (!id) return;
    setLabelInputPromptPointId((previousPromptPointId) =>
      previousPromptPointId === id ? null : previousPromptPointId
    );
  }, []);

  const handleDistancePointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      const directRelationId = sourcePointId
        ? getDistanceRelationId(sourcePointId, newPointId)
        : null;
      const relationAlreadyExists = directRelationId
        ? distanceRelations.some((relation) => relation.id === directRelationId)
        : false;

      trackMeasurementDraftPointIds([newPointId]);
      if (sourcePointId) {
        upsertDirectDistanceRelation(sourcePointId, newPointId);
        if (!relationAlreadyExists) {
          trackMeasurementDraftRelationId(directRelationId);
        }
      }

      setActivePlanarMeasurementId(null);
      if (distanceModeStickyToFirstPoint) {
        if (!referencePointMeasurementId) {
          setReferencePoint(newPointPositionECEF);
        }
        setDoubleClickChainSourcePointId(
          referencePointMeasurementId ?? newPointId
        );
      } else {
        if (sourcePointId) {
          finishDistanceMeasurementSession(newPointId, true);
        } else {
          setDoubleClickChainSourcePointId(newPointId);
        }
      }
      if (!sourcePointId || distanceModeStickyToFirstPoint) {
        selectAnnotationByIdImmediate(newPointId);
      }
    },
    [
      distanceRelations,
      distanceModeStickyToFirstPoint,
      finishDistanceMeasurementSession,
      referencePointMeasurementId,
      resolveDistanceRelationSourcePointId,
      selectAnnotationByIdImmediate,
      trackMeasurementDraftPointIds,
      trackMeasurementDraftRelationId,
      setReferencePoint,
      upsertDirectDistanceRelation,
    ]
  );

  const handlePolylinePointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      const sourcePointId = resolveDistanceRelationSourcePointId(newPointId);
      const directRelationId = sourcePointId
        ? getDistanceRelationId(sourcePointId, newPointId)
        : null;

      let projectedPointPosition: Cartesian3 | null = null;
      const activeGroupSnapshot =
        (activePlanarMeasurementId
          ? planarPolygonGroups.find(
              (group) => group.id === activePlanarMeasurementId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `planar-polygon-${Date.now()}-${newPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations, {
        [newPointId]: newPointPositionECEF,
      });
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: PlanarMeasurementGroup["type"] = isAreaCreation
        ? (activeToolType as PlanarPolygonAreaType)
        : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const verticalAutoCloseFromNewPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== newPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, newPointId]
            : [newPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), newPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromNewPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromNewPoint
      );

      trackMeasurementDraftPointIds([
        newPointId,
        ...(createdVerticalAutoCorners?.map(({ id }) => id) ?? []),
      ]);

      if (sourcePointId && !autoClosedAsVerticalRectangle) {
        const relationAlreadyExists = directRelationId
          ? distanceRelations.some(
              (relation) => relation.id === directRelationId
            )
          : false;
        upsertDirectDistanceRelation(sourcePointId, newPointId);
        if (!relationAlreadyExists) {
          trackMeasurementDraftRelationId(directRelationId);
        }
      }

      setPlanarMeasurements((prev) => {
        const activeGroup =
          (activePlanarMeasurementId
            ? prev.find((group) => group.id === activePlanarMeasurementId)
            : null) ?? null;

        const pointById = getPointPositionMap(annotations, {
          [newPointId]: newPointPositionECEF,
        });

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== newPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, newPointId]
              : [newPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromNewPoint
          ) {
            verticalAutoCloseFromNewPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromNewPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        let nextNodeIds = [...activeGroup.nodeIds, newPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        let nextPointPosition = newPointPositionECEF;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          isPlanarSurface &&
          !nextPlaneLocked &&
          activeGroup.nodeIds.length === 1
        ) {
          const firstNodeId = activeGroup.nodeIds[0] ?? null;
          const firstNodePosition = firstNodeId
            ? pointById.get(firstNodeId) ?? null
            : null;
          if (firstNodePosition) {
            nextPointPosition = projectPointToHorizontalPlaneAtAnchor(
              nextPointPosition,
              firstNodePosition
            );
            projectedPointPosition = nextPointPosition;
            pointById.set(newPointId, nextPointPosition);
          }
        }

        if (!shouldKeepSurfaceSampledVertices && nextPlaneLocked && nextPlane) {
          nextPointPosition = projectPointOntoPlane(
            nextPointPosition,
            nextPlane
          );
          projectedPointPosition = nextPointPosition;
          pointById.set(newPointId, nextPointPosition);
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              nextPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
              nextPointPosition = projectPointOntoPlane(
                nextPointPosition,
                nextPlane
              );
              projectedPointPosition = nextPointPosition;
              pointById.set(newPointId, nextPointPosition);
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                nextPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
                nextPointPosition = projectPointOntoPlane(
                  nextPointPosition,
                  orientedCandidatePlane
                );
                projectedPointPosition = nextPointPosition;
                pointById.set(newPointId, nextPointPosition);
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromNewPoint
        ) {
          verticalAutoCloseFromNewPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromNewPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      setActivePlanarMeasurementId(nextActiveGroupId);

      if (projectedPointPosition) {
        const geometryWGS84 = getDegreesFromCartesian(projectedPointPosition);
        setAnnotations((prev) =>
          prev.map((measurement) => {
            if (
              !isPointAnnotationEntry(measurement) ||
              measurement.id !== newPointId
            ) {
              return measurement;
            }
            return {
              ...measurement,
              geometryECEF: projectedPointPosition as Cartesian3,
              geometryWGS84: {
                longitude: geometryWGS84.longitude,
                latitude: geometryWGS84.latitude,
                altitude: getEllipsoidalAltitudeOrZero(geometryWGS84.altitude),
              },
            };
          })
        );
      }

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActivePlanarDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
      } else {
        setDoubleClickChainSourcePointId(newPointId);
        if (!sourcePointId) {
          selectAnnotationById(newPointId);
        }
      }
    },
    [
      activePlanarMeasurementId,
      annotations,
      planarPolygonGroups,
      resolveDistanceRelationSourcePointId,
      selectAnnotationById,
      upsertDirectDistanceRelation,
      setAnnotations,
      defaultPolylineSegmentLineMode,
      selectRepresentativeNodeForMeasurementId,
      distanceRelations,
      polylineVerticalOffsetMeters,
      activeToolType,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
      trackMeasurementDraftPointIds,
      trackMeasurementDraftRelationId,
    ]
  );

  const pointCreatedHandlerByToolType = useMemo<
    Partial<
      Record<AnnotationToolType, (id: string, positionECEF: Cartesian3) => void>
    >
  >(
    () => ({
      [ANNOTATION_TYPE_POINT]: (id) => handlePointMeasurePointCreated(id),
      [ANNOTATION_TYPE_LABEL]: (id) => handlePointMeasurePointCreated(id),
      [ANNOTATION_TYPE_DISTANCE]: (id, positionECEF) =>
        handleDistancePointCreated(id, positionECEF),
      [ANNOTATION_TYPE_POLYLINE]: (id, positionECEF) =>
        handlePolylinePointCreated(id, positionECEF),
      [ANNOTATION_TYPE_AREA_GROUND]: (id, positionECEF) =>
        handlePolylinePointCreated(id, positionECEF),
      [ANNOTATION_TYPE_AREA_VERTICAL]: (id, positionECEF) =>
        handlePolylinePointCreated(id, positionECEF),
      [ANNOTATION_TYPE_AREA_PLANAR]: (id, positionECEF) =>
        handlePolylinePointCreated(id, positionECEF),
    }),
    [
      handlePointMeasurePointCreated,
      handleDistancePointCreated,
      handlePolylinePointCreated,
    ]
  );

  const handlePointQueryPointCreated = useCallback(
    (newPointId: string, newPointPositionECEF: Cartesian3) => {
      pointCreatedHandlerByToolType[activeToolType]?.(
        newPointId,
        newPointPositionECEF
      );
    },
    [activeToolType, pointCreatedHandlerByToolType]
  );

  const closeActivePlanarPolygonGroup = useCallback(
    (typeOverride?: PlanarPolygonAreaType) => {
      let closedGroupId: string | null = null;
      clearAnnotationCursor();

      setPlanarMeasurements((prev) => {
        if (!activePlanarMeasurementId) return prev;
        const activeGroup = prev.find(
          (group) => group.id === activePlanarMeasurementId
        );
        if (
          !activeGroup ||
          activeGroup.closed ||
          activeGroup.nodeIds.length < 3
        ) {
          return prev;
        }

        const pointById = getPointPositionMap(annotations);
        const closedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            closed: true,
            type:
              typeOverride ?? activeGroup.type ?? ANNOTATION_TYPE_AREA_PLANAR,
            edgeRelationIds: buildEdgeRelationIdsForPolygon(
              activeGroup.nodeIds,
              true,
              getDistanceRelationId
            ),
          },
          pointById
        );
        closedGroupId = activeGroup.id;
        return prev.map((group) =>
          group.id === activeGroup.id ? closedGroup : group
        );
      });

      if (closedGroupId) {
        selectRepresentativeNodeForMeasurementId(closedGroupId);
      } else {
        clearActivePlanarDrawingState();
      }
    },
    [
      activePlanarMeasurementId,
      annotations,
      clearActivePlanarDrawingState,
      clearAnnotationCursor,
      computePolygonGroupDerivedDataWithCamera,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  const confirmPolylineRingPromotion = useCallback(
    (type: PlanarPolygonAreaType) => {
      if (!pendingPolylinePromotionRingClosurePointId) return;
      setPendingPolylinePromotionRingClosurePointId(null);
      closeActivePlanarPolygonGroup(type);
    },
    [
      pendingPolylinePromotionRingClosurePointId,
      closeActivePlanarPolygonGroup,
      setPendingPolylinePromotionRingClosurePointId,
    ]
  );

  const cancelPolylineRingPromotion = useCallback(() => {
    if (!pendingPolylinePromotionRingClosurePointId) return;
    const ringClosurePointId = pendingPolylinePromotionRingClosurePointId;
    setPendingPolylinePromotionRingClosurePointId(null);
    closeActivePlanarPolylineGroupAsRing(ringClosurePointId);
  }, [
    pendingPolylinePromotionRingClosurePointId,
    setPendingPolylinePromotionRingClosurePointId,
  ]);

  const closeActivePlanarPolylineGroupAsRing = useCallback(
    (ringClosurePointId: string) => {
      if (!activePlanarMeasurementId) return;
      const finishedGroupId = activePlanarMeasurementId;
      clearAnnotationCursor();

      setPlanarMeasurements((prev) => {
        const pointById = getPointPositionMap(annotations);
        return prev.map((group) => {
          if (group.id !== activePlanarMeasurementId || group.closed) {
            return group;
          }
          if (group.nodeIds.length < 3) {
            return group;
          }

          const lastPointId = group.nodeIds[group.nodeIds.length - 1] ?? null;
          const nextNodeIds =
            lastPointId === ringClosurePointId
              ? [...group.nodeIds]
              : [...group.nodeIds, ringClosurePointId];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            false,
            getDistanceRelationId
          );

          return computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              closed: false,
              edgeRelationIds: nextEdgeRelationIds,
              nodeIds: nextNodeIds,
            },
            pointById
          );
        });
      });

      selectRepresentativeNodeForMeasurementId(finishedGroupId);
    },
    [
      activePlanarMeasurementId,
      annotations,
      clearAnnotationCursor,
      computePolygonGroupDerivedDataWithCamera,
      selectRepresentativeNodeForMeasurementId,
    ]
  );

  const finishActivePlanarPolylineGroup = useCallback(() => {
    if (!activePlanarMeasurementId) return;
    const finishedGroupId = activePlanarMeasurementId;
    clearAnnotationCursor();
    selectRepresentativeNodeForMeasurementId(finishedGroupId);
  }, [
    activePlanarMeasurementId,
    clearAnnotationCursor,
    selectRepresentativeNodeForMeasurementId,
  ]);

  const requestEnterToolType = useCallback(
    (toolType: AnnotationToolType) => {
      const nextSelectionModeActive = toolType === SELECT_TOOL_TYPE;

      setSelectionModeActive((previousValue) =>
        previousValue === nextSelectionModeActive
          ? previousValue
          : nextSelectionModeActive
      );
      annotationsStore.setState((previousStoreState) =>
        previousStoreState.annotationToolType === toolType
          ? previousStoreState
          : {
              ...previousStoreState,
              annotationToolType: toolType,
            }
      );
    },
    [annotationsStore, setSelectionModeActive]
  );

  const clearSharedModeExitState = useCallback(() => {
    clearAnnotationCursor();
    clearAnnotationSelection();
    clearActivePlanarDrawingState();
    clearMoveGizmo();
    clearPendingPolylineRingPromotion();
    clearPendingLabelPlacementAnnotation();
  }, [
    clearActivePlanarDrawingState,
    clearAnnotationCursor,
    clearAnnotationSelection,
    clearPendingLabelPlacementAnnotation,
    clearPendingPolylineRingPromotion,
    clearMoveGizmo,
  ]);

  const handlePointQueryDoubleClick = useCallback(() => {
    if (
      (activeToolType === ANNOTATION_TYPE_POLYLINE ||
        isAreaToolType(activeToolType)) &&
      activePlanarMeasurementId
    ) {
      const activeOpenGroup =
        planarPolygonGroups.find(
          (group) => group.id === activePlanarMeasurementId && !group.closed
        ) ?? null;
      const firstNodeId = activeOpenGroup?.nodeIds[0] ?? null;
      const canCloseRing = Boolean(
        firstNodeId && activeOpenGroup && activeOpenGroup.nodeIds.length >= 3
      );

      if (canCloseRing && firstNodeId) {
        if (activeToolType !== ANNOTATION_TYPE_POLYLINE) {
          closeActivePlanarPolygonGroup();
        } else {
          finishActivePlanarPolylineGroup();
        }
        return;
      }
    }

    // Finish current open line chain when no ring closure can be performed.
    finishActivePlanarPolylineGroup();
  }, [
    activeToolType,
    activePlanarMeasurementId,
    planarPolygonGroups,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
  ]);

  const appendExistingPointToActivePlanarPolygonGroup = useCallback(
    (existingPointId: string, sourcePointId?: string | null) => {
      const existingPoint = getPointById(annotations, existingPointId);
      if (!existingPoint || !isPointAnnotationEntry(existingPoint)) return;
      const existingPointPosition = existingPoint.geometryECEF;
      const activeGroupSnapshot =
        (activePlanarMeasurementId
          ? planarPolygonGroups.find(
              (group) => group.id === activePlanarMeasurementId
            )
          : null) ?? null;
      const creatingNewGroup =
        !activeGroupSnapshot || Boolean(activeGroupSnapshot.closed);
      const nextActiveGroupId = creatingNewGroup
        ? `planar-polygon-${Date.now()}-${existingPointId}`
        : activeGroupSnapshot.id;
      const pointByIdSnapshot = getPointPositionMap(annotations);
      const isAreaCreation = isAreaToolType(activeToolType);
      const seedTypeForCreation: PlanarMeasurementGroup["type"] = isAreaCreation
        ? (activeToolType as PlanarPolygonAreaType)
        : ANNOTATION_TYPE_POLYLINE;
      const seedSegmentLineMode = isAreaCreation
        ? LINEAR_SEGMENT_LINE_MODE_DIRECT
        : defaultPolylineSegmentLineMode;
      const verticalAutoCloseFromExistingPoint = (() => {
        if (!isAreaCreation) return null;

        const candidateNodeIds = creatingNewGroup
          ? sourcePointId &&
            sourcePointId !== existingPointId &&
            pointByIdSnapshot.has(sourcePointId)
            ? [sourcePointId, existingPointId]
            : [existingPointId]
          : [...(activeGroupSnapshot?.nodeIds ?? []), existingPointId];

        const candidateType = creatingNewGroup
          ? seedTypeForCreation
          : activeGroupSnapshot?.type ?? ANNOTATION_TYPE_AREA_PLANAR;

        if (candidateType !== ANNOTATION_TYPE_AREA_VERTICAL) return null;
        if (candidateNodeIds.length !== 2) return null;

        return buildVerticalAutoCloseRectangle(
          pointByIdSnapshot,
          candidateNodeIds[0] ?? null,
          candidateNodeIds[1] ?? null
        );
      })();
      const createdVerticalAutoCorners =
        verticalAutoCloseFromExistingPoint?.autoCorners;
      const autoClosedAsVerticalRectangle = Boolean(
        verticalAutoCloseFromExistingPoint
      );

      setPlanarMeasurements((prev) => {
        const activeGroup =
          (activePlanarMeasurementId
            ? prev.find((group) => group.id === activePlanarMeasurementId)
            : null) ?? null;
        const pointById = getPointPositionMap(annotations);

        if (!activeGroup || activeGroup.closed) {
          const seedNodeIds =
            sourcePointId &&
            sourcePointId !== existingPointId &&
            pointById.has(sourcePointId)
              ? [sourcePointId, existingPointId]
              : [existingPointId];
          const seedType = seedTypeForCreation;

          if (
            isAreaCreation &&
            seedType === ANNOTATION_TYPE_AREA_VERTICAL &&
            seedNodeIds.length === 2 &&
            verticalAutoCloseFromExistingPoint
          ) {
            verticalAutoCloseFromExistingPoint.autoCorners.forEach(
              ({ id, position }) => {
                pointById.set(id, position);
              }
            );
            const closedNodeIds = [
              ...verticalAutoCloseFromExistingPoint.closedNodeIds,
            ];
            const closedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
              closedNodeIds,
              true,
              getDistanceRelationId
            );
            return [
              ...prev,
              computePolygonGroupDerivedDataWithCamera(
                {
                  id: nextActiveGroupId,
                  type: seedTypeForCreation,
                  segmentLineMode: seedSegmentLineMode,
                  verticalOffsetMeters: polylineVerticalOffsetMeters,
                  nodeIds: closedNodeIds,
                  edgeRelationIds: closedEdgeRelationIds,
                  distanceMeasurementStartPointId:
                    closedNodeIds[0] ?? undefined,
                  closed: true,
                  planeLocked: true,
                  areaSquareMeters: 0,
                  verticalityDeg: 0,
                },
                pointById
              ),
            ];
          }

          const seedEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            seedNodeIds,
            false,
            getDistanceRelationId
          );
          return [
            ...prev,
            {
              id: nextActiveGroupId,
              type: seedType,
              segmentLineMode: seedSegmentLineMode,
              verticalOffsetMeters: polylineVerticalOffsetMeters,
              nodeIds: seedNodeIds,
              edgeRelationIds: seedEdgeRelationIds,
              distanceMeasurementStartPointId: seedNodeIds[0] ?? undefined,
              closed: false,
              planeLocked: false,
              areaSquareMeters: 0,
              verticalityDeg: 0,
            },
          ];
        }

        const lastNodeId =
          activeGroup.nodeIds[activeGroup.nodeIds.length - 1] ?? null;
        if (lastNodeId === existingPointId) {
          return prev;
        }

        let nextNodeIds = [...activeGroup.nodeIds, existingPointId];
        let shouldCloseGroup = activeGroup.closed;
        let nextPlane = activeGroup.plane;
        let nextPlaneLocked = activeGroup.planeLocked;
        const shouldKeepSurfaceSampledVertices =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_GROUND;
        const isPlanarSurface =
          isAreaCreation && activeGroup.type === ANNOTATION_TYPE_AREA_PLANAR;

        if (
          !shouldKeepSurfaceSampledVertices &&
          isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 3
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          if (first && second) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              existingPointPosition
            );
            if (candidatePlane) {
              nextPlane = orientPlaneTowardSceneCamera(candidatePlane);
              nextPlaneLocked = true;
            }
          }
        } else if (
          !shouldKeepSurfaceSampledVertices &&
          !isPlanarSurface &&
          !nextPlaneLocked &&
          nextNodeIds.length >= 4
        ) {
          const first = pointById.get(nextNodeIds[0] ?? "");
          const second = pointById.get(nextNodeIds[1] ?? "");
          const third = pointById.get(nextNodeIds[2] ?? "");
          if (first && second && third) {
            const candidatePlane = createPlaneFromThreePoints(
              first,
              second,
              third
            );
            if (candidatePlane) {
              const orientedCandidatePlane =
                orientPlaneTowardSceneCamera(candidatePlane);
              const planeDistance = distancePointToPlane(
                existingPointPosition,
                orientedCandidatePlane
              );
              const firstFourPoints = nextNodeIds
                .slice(0, 4)
                .map((pointId) => pointById.get(pointId))
                .filter((point): point is Cartesian3 => Boolean(point));
              const planarAngleSum = computePolylinePlanarAngleSumDeg(
                firstFourPoints,
                orientedCandidatePlane
              );

              if (
                planeDistance <= PLANAR_PROMOTION_DISTANCE_THRESHOLD_METERS &&
                planarAngleSum < PLANAR_PROMOTION_ANGLE_SUM_THRESHOLD_DEG
              ) {
                nextPlane = orientedCandidatePlane;
                nextPlaneLocked = true;
              }
            }
          }
        }

        if (
          isAreaCreation &&
          activeGroup.type === ANNOTATION_TYPE_AREA_VERTICAL &&
          nextNodeIds.length === 2 &&
          verticalAutoCloseFromExistingPoint
        ) {
          verticalAutoCloseFromExistingPoint.autoCorners.forEach(
            ({ id, position }) => {
              pointById.set(id, position);
            }
          );
          nextNodeIds = [...verticalAutoCloseFromExistingPoint.closedNodeIds];
          shouldCloseGroup = true;
          nextPlaneLocked = true;
        }

        const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
          nextNodeIds,
          shouldCloseGroup,
          getDistanceRelationId
        );
        const updatedGroup = computePolygonGroupDerivedDataWithCamera(
          {
            ...activeGroup,
            type: activeGroup.type,
            nodeIds: nextNodeIds,
            edgeRelationIds: nextEdgeRelationIds,
            closed: shouldCloseGroup,
            planeLocked: shouldKeepSurfaceSampledVertices
              ? false
              : nextPlaneLocked,
            plane: shouldKeepSurfaceSampledVertices ? undefined : nextPlane,
          },
          pointById
        );
        return prev.map((group) =>
          group.id === activeGroup.id ? updatedGroup : group
        );
      });

      if (createdVerticalAutoCorners && createdVerticalAutoCorners.length > 0) {
        setAnnotations((prev) => {
          const pointEntries = prev.filter(isPointAnnotationEntry);
          const maxPointIndex = pointEntries.reduce(
            (maxIndex, measurement) =>
              Math.max(maxIndex, measurement.index ?? 0),
            0
          );
          const autoCornerEntries: AnnotationEntry[] =
            createdVerticalAutoCorners.map(({ id, position }, index) => {
              const cornerWGS84 = getDegreesFromCartesian(position);
              return {
                type: ANNOTATION_TYPE_DISTANCE,
                id,
                index: maxPointIndex + index + 1,
                geometryECEF: position,
                geometryWGS84: {
                  longitude: cornerWGS84.longitude,
                  latitude: cornerWGS84.latitude,
                  altitude: getEllipsoidalAltitudeOrZero(cornerWGS84.altitude),
                },
                timestamp: Date.now() + index,
              };
            });
          return [...prev, ...autoCornerEntries];
        });
      }

      if (autoClosedAsVerticalRectangle) {
        clearActivePlanarDrawingState();
        selectRepresentativeNodeForMeasurementId(nextActiveGroupId);
        clearMoveGizmo();
        return true;
      }

      setActivePlanarMeasurementId(nextActiveGroupId);
      return true;
    },
    [
      activePlanarMeasurementId,
      annotations,
      clearActivePlanarDrawingState,
      clearMoveGizmo,
      selectRepresentativeNodeForMeasurementId,
      planarPolygonGroups,
      defaultPolylineSegmentLineMode,
      polylineVerticalOffsetMeters,
      activeToolType,
      orientPlaneTowardSceneCamera,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  const setShowSelectedReferenceLine = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (value) => {
      if (!selectedDistancePair) return;

      const { activePointId, previousPointId } = selectedDistancePair;
      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, activePointId, previousPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
                edgeId: getMeasurementEdgeId(activePointId, previousPointId),
                pointAId: activePointId,
                pointBId: previousPointId,
                anchorPointId: activePointId,
                showDirectLine: false,
                showVerticalLine: false,
                showHorizontalLine: false,
                showComponentLines: false,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);
        const currentValue = relation.showDirectLine ?? false;
        const nextValue =
          typeof value === "function" ? value(currentValue) : value;

        if (nextValue === currentValue && relationIndex >= 0) {
          return prev;
        }

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(activePointId, previousPointId),
          anchorPointId: activePointId,
          showDirectLine: nextValue,
          showVerticalLine:
            relation.showVerticalLine ?? relation.showComponentLines ?? false,
          showHorizontalLine:
            relation.showHorizontalLine ?? relation.showComponentLines ?? false,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
        };

        if (!hasAnyVisibleDistanceRelationLine(nextRelation)) {
          if (relationIndex < 0) return prev;
          return prev.filter((_, index) => index !== relationIndex);
        }

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [selectedDistancePair]
  );

  const setShowSelectedReferenceLineComponents = useCallback<
    Dispatch<SetStateAction<boolean>>
  >(
    (value) => {
      if (!selectedDistancePair) return;

      const { activePointId, previousPointId } = selectedDistancePair;
      setDistanceRelations((prev) => {
        const relationIndex = prev.findIndex((relation) =>
          isSameDistanceRelationPair(relation, activePointId, previousPointId)
        );
        const relation =
          relationIndex >= 0
            ? withDistanceRelationEdgeId(prev[relationIndex])
            : ({
                id: getDistanceRelationId(activePointId, previousPointId),
                edgeId: getMeasurementEdgeId(activePointId, previousPointId),
                pointAId: activePointId,
                pointBId: previousPointId,
                anchorPointId: activePointId,
                showDirectLine: false,
                showVerticalLine: false,
                showHorizontalLine: false,
                showComponentLines: false,
                labelVisibilityByKind:
                  DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              } satisfies PointDistanceRelation);
        const currentValue =
          (relation.showVerticalLine ?? relation.showComponentLines ?? false) ||
          (relation.showHorizontalLine ?? relation.showComponentLines ?? false);
        const nextValue =
          typeof value === "function" ? value(currentValue) : value;

        if (nextValue === currentValue && relationIndex >= 0) {
          return prev;
        }

        const nextRelation: PointDistanceRelation = {
          ...relation,
          edgeId: getMeasurementEdgeId(activePointId, previousPointId),
          anchorPointId: activePointId,
          showVerticalLine: nextValue,
          showHorizontalLine: nextValue,
          showComponentLines: nextValue,
          labelVisibilityByKind: {
            ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
            ...(relation.labelVisibilityByKind ?? {}),
          },
        };

        if (!hasAnyVisibleDistanceRelationLine(nextRelation)) {
          if (relationIndex < 0) return prev;
          return prev.filter((_, index) => index !== relationIndex);
        }

        if (relationIndex < 0) return [...prev, nextRelation];
        return prev.map((entry, index) =>
          index === relationIndex ? nextRelation : entry
        );
      });
    },
    [selectedDistancePair]
  );

  const toggleDistanceRelationLineLabelVisibility = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) return;
      setDistanceRelations((prev) =>
        prev.map((relation) => {
          if (relation.id !== relationId) return relation;
          const currentValue =
            relation.labelVisibilityByKind?.[kind] ??
            DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY[kind];
          return {
            ...relation,
            labelVisibilityByKind: {
              ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
              ...(relation.labelVisibilityByKind ?? {}),
              [kind]: !currentValue,
            },
          };
        })
      );
    },
    []
  );

  const handleDistanceRelationLineLabelToggle = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId) return;

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedPlanarMeasurementId &&
        ownerGroupIds.includes(focusedPlanarMeasurementId);

      if (ownerGroupIds.length > 0 && !focusedGroupOwnsRelation) {
        const preferredOwnerGroupId =
          (activePlanarMeasurementId &&
          ownerGroupIds.includes(activePlanarMeasurementId)
            ? activePlanarMeasurementId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
        return;
      }

      // For "direct" kind on open polylines, cycle mode on ALL edges in the connected polyline
      if (kind === "direct" && focusedPlanarMeasurementId) {
        const connectedOpenGroupIds = getConnectedOpenPolylineGroupIds(
          planarPolygonGroups,
          focusedPlanarMeasurementId
        );
        if (connectedOpenGroupIds.size > 0) {
          const allRelationIds = new Set<string>();
          planarPolygonGroups.forEach((group) => {
            if (!connectedOpenGroupIds.has(group.id)) return;
            group.edgeRelationIds.forEach((rid) => allRelationIds.add(rid));
          });

          if (allRelationIds.size > 0) {
            setDistanceRelations((prev) => {
              const currentMode: DirectLineLabelMode =
                prev.find((r) => r.id === relationId)?.directLabelMode ??
                DEFAULT_DIRECT_LINE_LABEL_MODE;
              const nextMode = getNextDirectLineLabelMode(currentMode);
              return prev.map((relation) => {
                if (!allRelationIds.has(relation.id)) return relation;
                return {
                  ...relation,
                  directLabelMode: nextMode,
                  labelVisibilityByKind: {
                    ...DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
                    ...(relation.labelVisibilityByKind ?? {}),
                    direct: nextMode !== "none",
                  },
                };
              });
            });
            return;
          }
        }
      }

      toggleDistanceRelationLineLabelVisibility(relationId, kind);
    },
    [
      activePlanarMeasurementId,
      selectRepresentativeNodeForMeasurementId,
      focusedPlanarMeasurementId,
      getOwnerGroupIdsForEdgeRelationId,
      planarPolygonGroups,
      setDistanceRelations,
      toggleDistanceRelationLineLabelVisibility,
    ]
  );

  const handleDistanceRelationLineClick = useCallback(
    (relationId: string, kind: ReferenceLineLabelKind) => {
      if (!relationId || kind !== "direct") return;

      const ownerGroupIds = getOwnerGroupIdsForEdgeRelationId(relationId);
      const focusedGroupOwnsRelation =
        !!focusedPlanarMeasurementId &&
        ownerGroupIds.includes(focusedPlanarMeasurementId);

      if (ownerGroupIds.length > 0) {
        if (focusedGroupOwnsRelation) {
          return;
        }
        const preferredOwnerGroupId =
          (activePlanarMeasurementId &&
          ownerGroupIds.includes(activePlanarMeasurementId)
            ? activePlanarMeasurementId
            : ownerGroupIds[0]) ?? null;
        selectRepresentativeNodeForMeasurementId(preferredOwnerGroupId);
        return;
      }
    },
    [
      activePlanarMeasurementId,
      selectRepresentativeNodeForMeasurementId,
      focusedPlanarMeasurementId,
      getOwnerGroupIdsForEdgeRelationId,
    ]
  );

  const { updateLabelAppearanceById: updatePointLabelAppearanceById } =
    useAnnotationEntryMutations<AnnotationEntry, AnnotationLabelAppearance>({
      setAnnotations,
      isLabelAppearanceTarget: isPointMeasurementEntry,
      getLabelAppearance: (measurement) =>
        isPointMeasurementEntry(measurement)
          ? measurement.labelAppearance
          : undefined,
      applyLabelAppearance: (measurement, appearance) => {
        if (!isPointMeasurementEntry(measurement)) {
          return measurement;
        }
        return applyLabelAppearance(measurement, appearance);
      },
      normalizeLabelAppearance: normalizeLabelAppearance,
    });

  const updatePlanarPolygonNameById = useCallback(
    (id: string, name: string) => {
      const nextName = name.trim();
      setPlanarMeasurements((prev) => {
        let hasChanged = false;
        const next = prev.map((group) => {
          if (group.id !== id) return group;
          if ((group.name ?? "") === nextName) return group;
          hasChanged = true;
          return {
            ...group,
            name: nextName.length > 0 ? nextName : undefined,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    []
  );

  const updatePlanarPolygonSegmentLineModeById = useCallback(
    (id: string, nextMode: LinearSegmentLineMode) => {
      setPlanarMeasurements((previousGroups) => {
        let hasChanged = false;
        const nextGroups = previousGroups.map((group) => {
          if (group.id !== id || group.segmentLineMode === nextMode) {
            return group;
          }

          hasChanged = true;
          return {
            ...group,
            segmentLineMode: nextMode,
          };
        });

        return hasChanged ? nextGroups : previousGroups;
      });
    },
    []
  );

  const updateAnnotationNameById = useCallback(
    (id: string, name: string) => {
      const isPlanarMeasurementId = planarPolygonGroups.some(
        (group) => group.id === id
      );
      if (isPlanarMeasurementId) {
        updatePlanarPolygonNameById(id, name);
        return;
      }

      updateAnnotationEntryNameById(id, name);
    },
    [
      planarPolygonGroups,
      updateAnnotationEntryNameById,
      updatePlanarPolygonNameById,
    ]
  );

  const updateAnnotationVisualizerOptionsById = useCallback(
    (
      id: string,
      patch: {
        segmentLineMode?: LinearSegmentLineMode;
      }
    ) => {
      if (patch.segmentLineMode) {
        updatePlanarPolygonSegmentLineModeById(id, patch.segmentLineMode);
      }
    },
    [updatePlanarPolygonSegmentLineModeById]
  );

  const togglePlanarPolygonGroupVisibilityById = useCallback((id: string) => {
    setPlanarMeasurements((previousGroups) => {
      let hasChanged = false;
      const nextGroups = previousGroups.map((group) => {
        if (group.id !== id) {
          return group;
        }

        hasChanged = true;
        return {
          ...group,
          hidden: !group.hidden,
        };
      });

      return hasChanged ? nextGroups : previousGroups;
    });
  }, []);

  const toggleAnnotationsVisibilityByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedPlanarIdSet = new Set(
        planarPolygonGroups
          .filter((group) => requestedIdSet.has(group.id))
          .map((group) => group.id)
      );
      const targetedAnnotationIdSet = new Set(
        ids.filter((id) => !targetedPlanarIdSet.has(id))
      );
      const shouldHide =
        annotations.some(
          (annotation) =>
            targetedAnnotationIdSet.has(annotation.id) && !annotation.hidden
        ) ||
        planarPolygonGroups.some(
          (group) => targetedPlanarIdSet.has(group.id) && !group.hidden
        );

      let hasAnnotationTargets = false;
      let hasPlanarTargets = false;
      targetedAnnotationIdSet.forEach(() => {
        hasAnnotationTargets = true;
      });
      targetedPlanarIdSet.forEach(() => {
        hasPlanarTargets = true;
      });

      if (hasAnnotationTargets) {
        setAnnotations((previousAnnotations) => {
          let hasChanges = false;
          const nextAnnotations = previousAnnotations.map((annotation) => {
            if (!targetedAnnotationIdSet.has(annotation.id)) {
              return annotation;
            }

            if (Boolean(annotation.hidden) === shouldHide) {
              return annotation;
            }

            hasChanges = true;
            return {
              ...annotation,
              hidden: shouldHide,
            };
          });

          return hasChanges ? nextAnnotations : previousAnnotations;
        });
      }

      if (hasPlanarTargets) {
        setPlanarMeasurements((previousGroups) => {
          let hasChanges = false;
          const nextGroups = previousGroups.map((group) => {
            if (!targetedPlanarIdSet.has(group.id)) {
              return group;
            }

            if (Boolean(group.hidden) === shouldHide) {
              return group;
            }

            hasChanges = true;
            return {
              ...group,
              hidden: shouldHide,
            };
          });

          return hasChanges ? nextGroups : previousGroups;
        });
      }
    },
    [annotations, planarPolygonGroups]
  );

  const togglePlanarPolygonGroupLockById = useCallback(
    (id: string) => {
      const targetGroup = planarPolygonGroups.find((group) => group.id === id);
      if (!targetGroup || targetGroup.nodeIds.length === 0) {
        return;
      }

      const nodeIdSet = new Set(targetGroup.nodeIds);
      const shouldLock = targetGroup.nodeIds.some((nodeId) => {
        const vertex = annotations.find((entry) => entry.id === nodeId);
        return !vertex?.locked;
      });

      setAnnotations((previousAnnotations) => {
        let hasChanged = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (
            !nodeIdSet.has(annotation.id) ||
            annotation.locked === shouldLock
          ) {
            return annotation;
          }

          hasChanged = true;
          return {
            ...annotation,
            locked: shouldLock,
          };
        });

        return hasChanged ? nextAnnotations : previousAnnotations;
      });
    },
    [annotations, planarPolygonGroups, setAnnotations]
  );

  const toggleAnnotationsLockByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedPlanarGroups = planarPolygonGroups.filter((group) =>
        requestedIdSet.has(group.id)
      );
      const targetedVertexIdSet = new Set(
        targetedPlanarGroups.flatMap((group) => group.nodeIds)
      );
      const targetedAnnotationIdSet = new Set(
        annotations
          .filter(
            (annotation) =>
              requestedIdSet.has(annotation.id) ||
              targetedVertexIdSet.has(annotation.id)
          )
          .map((annotation) => annotation.id)
      );

      if (targetedAnnotationIdSet.size === 0) {
        return;
      }

      const shouldLock = annotations.some(
        (annotation) =>
          targetedAnnotationIdSet.has(annotation.id) && !annotation.locked
      );

      setAnnotations((previousAnnotations) => {
        let hasChanges = false;
        const nextAnnotations = previousAnnotations.map((annotation) => {
          if (
            !targetedAnnotationIdSet.has(annotation.id) ||
            annotation.locked === shouldLock
          ) {
            return annotation;
          }

          hasChanges = true;
          return {
            ...annotation,
            locked: shouldLock,
          };
        });

        return hasChanges ? nextAnnotations : previousAnnotations;
      });
    },
    [annotations, planarPolygonGroups]
  );

  const setPointLabelMetricModeById = useCallback(
    (id: string, mode: PointLabelMetricMode) => {
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }
          const normalizedMode =
            mode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : mode;
          if (measurement.pointLabelMode === normalizedMode) {
            return measurement;
          }
          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedMode };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const cyclePointLabelMetricModeByMeasurementId = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        let hasChanged = false;

        const next = prev.map((measurement) => {
          if (!isPointMeasurementEntry(measurement) || measurement.id !== id) {
            return measurement;
          }

          const currentMode =
            measurement.pointLabelMode ?? DEFAULT_POINT_LABEL_METRIC_MODE;
          const nextMode = getNextPointLabelMetricMode(currentMode);
          const normalizedNextMode =
            nextMode === DEFAULT_POINT_LABEL_METRIC_MODE ? undefined : nextMode;

          if (measurement.pointLabelMode === normalizedNextMode) {
            return measurement;
          }

          hasChanged = true;
          return { ...measurement, pointLabelMode: normalizedNextMode };
        });

        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const handlePointLabelDoubleClick = useCallback(
    (id: string) => {
      if (!selectablePointIds.has(id)) {
        return;
      }

      const clickedPoint = annotations.find(
        (measurement) =>
          isPointAnnotationEntry(measurement) && measurement.id === id
      );
      if (clickedPoint && isPointAnnotationEntry(clickedPoint)) {
        setReferencePoint(clickedPoint.geometryECEF);
      }

      // Double click finishes the current line chain.
      finishDistanceMeasurementSession(id);
    },
    [
      annotations,
      finishDistanceMeasurementSession,
      selectablePointIds,
      setReferencePoint,
    ]
  );

  const handleDistanceRelationCornerClick = useCallback(
    (relationId: string) => {
      if (!relationId) return;
      setDistanceRelations((prev) =>
        prev.map((relation) => {
          if (relation.id !== relationId) return relation;
          const nextAnchorPointId =
            relation.anchorPointId === relation.pointAId
              ? relation.pointBId
              : relation.pointAId;
          return {
            ...relation,
            anchorPointId: nextAnchorPointId,
          };
        })
      );
    },
    []
  );

  const handleDistanceRelationMidpointClick = useCallback(
    (relationId: string) => {
      if (!relationId) return;
      const targetGroupId =
        getOwnerGroupIdsForEdgeRelationId(relationId)[0] ?? null;
      const targetGroup =
        targetGroupId !== null
          ? planarPolygonGroups.find((group) => group.id === targetGroupId) ??
            null
          : null;
      if (!targetGroup) return;

      const nodeIds = targetGroup.nodeIds;
      if (nodeIds.length < 2) return;

      let edgeStartId: string | null = null;
      let edgeEndId: string | null = null;
      let insertIndex = -1;

      for (let index = 0; index < nodeIds.length - 1; index += 1) {
        const startId = nodeIds[index];
        const endId = nodeIds[index + 1];
        if (!startId || !endId) continue;
        const edgeId = getDistanceRelationId(startId, endId);
        if (edgeId === relationId) {
          edgeStartId = startId;
          edgeEndId = endId;
          insertIndex = index + 1;
          break;
        }
      }

      if (!edgeStartId || !edgeEndId) {
        if (targetGroup.closed && nodeIds.length >= 3) {
          const startId = nodeIds[nodeIds.length - 1];
          const endId = nodeIds[0];
          if (startId && endId) {
            const edgeId = getDistanceRelationId(startId, endId);
            if (edgeId === relationId) {
              edgeStartId = startId;
              edgeEndId = endId;
              insertIndex = nodeIds.length;
            }
          }
        }
      }

      if (!edgeStartId || !edgeEndId || insertIndex < 0) return;

      const pointById = getPointPositionMap(annotations);
      const startPoint = pointById.get(edgeStartId);
      const endPoint = pointById.get(edgeEndId);
      if (!startPoint || !endPoint) return;

      let midpointPosition = Cartesian3.midpoint(
        startPoint,
        endPoint,
        new Cartesian3()
      );
      const targetGroupVerticalPolygonFrame =
        targetGroup.type === ANNOTATION_TYPE_AREA_VERTICAL
          ? resolveLocalFrameVectors(targetGroup.planarPolygonLocalFrame)
          : null;
      if (targetGroupVerticalPolygonFrame) {
        const startLocal = getPositionInLocalFrame(
          startPoint,
          targetGroupVerticalPolygonFrame
        );
        const endLocal = getPositionInLocalFrame(
          endPoint,
          targetGroupVerticalPolygonFrame
        );
        midpointPosition = getPositionFromLocalFrame(
          targetGroupVerticalPolygonFrame,
          (startLocal.eastMeters + endLocal.eastMeters) / 2,
          (startLocal.northMeters + endLocal.northMeters) / 2,
          (startLocal.upMeters + endLocal.upMeters) / 2
        );
      }
      if (
        targetGroup.type !== ANNOTATION_TYPE_AREA_GROUND &&
        targetGroup.planeLocked &&
        targetGroup.plane
      ) {
        midpointPosition = projectPointOntoPlane(
          midpointPosition,
          targetGroup.plane
        );
      }

      const nextPointId = `point-${Date.now()}-split`;
      const midpointWGS84 = getDegreesFromCartesian(midpointPosition);
      setAnnotations((prev) => {
        const insertionBaseIndex =
          prev.find(
            (measurement) =>
              isPointAnnotationEntry(measurement) &&
              measurement.id === edgeStartId
          )?.index ?? prev.filter(isPointAnnotationEntry).length;
        const insertionIndex = insertionBaseIndex + 1;

        const nextMeasurements = prev.map((measurement) => {
          if (
            isPointAnnotationEntry(measurement) &&
            measurement.index >= insertionIndex
          ) {
            return {
              ...measurement,
              index: measurement.index + 1,
            };
          }
          return measurement;
        });

        return [
          ...nextMeasurements,
          {
            type: ANNOTATION_TYPE_DISTANCE,
            id: nextPointId,
            index: insertionIndex,
            geometryECEF: midpointPosition,
            geometryWGS84: {
              longitude: midpointWGS84.longitude,
              latitude: midpointWGS84.latitude,
              altitude: getEllipsoidalAltitudeOrZero(midpointWGS84.altitude),
            },
            timestamp: new Date().getTime(),
          },
        ];
      });

      const updatedPointById = getPointPositionMap(annotations, {
        [nextPointId]: midpointPosition,
      });
      setPlanarMeasurements((prev) =>
        prev.map((group) => {
          if (group.id !== targetGroup.id) return group;
          const nextNodeIds = [
            ...group.nodeIds.slice(0, insertIndex),
            nextPointId,
            ...group.nodeIds.slice(insertIndex),
          ];
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            group.closed,
            getDistanceRelationId
          );
          return computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              nodeIds: nextNodeIds,
              edgeRelationIds: nextEdgeRelationIds,
            },
            updatedPointById
          );
        })
      );

      setActivePlanarMeasurementId(targetGroup.id);
      setDoubleClickChainSourcePointId(nextPointId);
      selectAnnotationById(nextPointId);
    },
    [
      annotations,
      getOwnerGroupIdsForEdgeRelationId,
      planarPolygonGroups,
      selectAnnotationById,
      computePolygonGroupDerivedDataWithCamera,
    ]
  );

  useEffect(
    function effectSyncDistanceRelationsWithPolygonEdges() {
      setDistanceRelations((prev) =>
        syncPolygonEdgeDistanceRelations(prev, planarPolygonGroups)
      );
    },
    [planarPolygonGroups, syncPolygonEdgeDistanceRelations]
  );
  const {
    markerlessPointIds,
    visibleMeasurementsForRendering,
    visiblePlanarPolygonGroupsForRendering,
    effectiveDistanceRelationsForRendering,
    hiddenPointLabelIds,
    effectiveFullyHiddenPointIds,
  } = useAnnotationsRenderState(
    annotations,
    distanceRelations,
    planarPolygonGroups,
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
      defaultDistanceRelationLabelVisibility:
        DEFAULT_DISTANCE_RELATION_LABEL_VISIBILITY,
    }
  );

  const clearAllAnnotations = useCallback(() => {
    setAnnotations([]);
    setDistanceRelations([]);
    setPlanarMeasurements([]);
    clearAnnotationSelection();
    clearActivePlanarDrawingState();
    clearMoveGizmo();
    // resetVisibility
    if (hideMeasurementsOfType.size > 0) {
      setHideMeasurementsOfType(new Set());
    }
  }, [
    clearActivePlanarDrawingState,
    clearAnnotationSelection,
    clearMoveGizmo,
    hideMeasurementsOfType.size,
  ]);

  const clearAnnotationsByType = useCallback(
    (type: AnnotationMode) => {
      setAnnotations((prev) =>
        prev.filter((measurement) => measurement.type !== type)
      );
      if (type === ANNOTATION_TYPE_DISTANCE) {
        setDistanceRelations([]);
        setPlanarMeasurements([]);
        clearActivePlanarDrawingState();
      }
      clearPointSelection();
      clearMoveGizmo();
      // resetVisibility
      setHideMeasurementsOfType((prev) => {
        if (!prev.has(type)) {
          return prev;
        }
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    },
    [clearActivePlanarDrawingState, clearMoveGizmo, clearPointSelection]
  );

  const clearAnnotationsByIds = useCallback(
    (ids: string[]) => {
      const pointById = new Map(
        annotations
          .filter(isPointAnnotationEntry)
          .map((measurement) => [measurement.id, measurement] as const)
      );

      const requestedIdSet = new Set(ids);
      const protectedPolygonNodeIdSet = new Set<string>();
      planarPolygonGroups.forEach((group) => {
        if (!group.closed || group.nodeIds.length > 3) {
          return;
        }
        const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
          Boolean(nodeId)
        );
        if (nodeIds.length === 0) {
          return;
        }
        const includesAnyNode = nodeIds.some((nodeId) =>
          requestedIdSet.has(nodeId)
        );
        if (!includesAnyNode) {
          return;
        }
        const includesAllNodes = nodeIds.every((nodeId) =>
          requestedIdSet.has(nodeId)
        );
        if (includesAllNodes) {
          return;
        }
        nodeIds.forEach((nodeId) => {
          protectedPolygonNodeIdSet.add(nodeId);
        });
      });

      const idsToDelete = new Set(
        ids.filter((id) => !protectedPolygonNodeIdSet.has(id))
      );
      if (idsToDelete.size === 0) {
        return;
      }
      let remainingRelations = [...distanceRelations];

      // Expand deletion set: if deleting a point removes a relation, and the
      // opposite endpoint was created exclusively for that removed relation,
      // remove that endpoint too (unless still referenced by another relation).
      let expanded = true;
      while (expanded) {
        expanded = false;

        const nextRemainingRelations: PointDistanceRelation[] = [];
        const removedRelations: PointDistanceRelation[] = [];
        remainingRelations.forEach((relation) => {
          if (
            idsToDelete.has(relation.pointAId) ||
            idsToDelete.has(relation.pointBId)
          ) {
            removedRelations.push(relation);
            return;
          }
          nextRemainingRelations.push(relation);
        });
        remainingRelations = nextRemainingRelations;

        removedRelations.forEach((relation) => {
          [relation.pointAId, relation.pointBId].forEach((pointId) => {
            if (idsToDelete.has(pointId)) return;
            const point = pointById.get(pointId);
            if (!point) return;
            if (point.type !== ANNOTATION_TYPE_DISTANCE) return;

            const stillReferencedByRemainingRelation = remainingRelations.some(
              (candidate) =>
                candidate.pointAId === pointId || candidate.pointBId === pointId
            );
            if (stillReferencedByRemainingRelation) return;
            const belongsToPlanarGroup =
              getOwnerGroupIdsForPointId(pointId).length > 0;
            if (belongsToPlanarGroup) return;

            idsToDelete.add(pointId);
            expanded = true;
          });
        });
      }

      setAnnotations((prev) => prev.filter((m) => !idsToDelete.has(m.id)));
      setDistanceRelations(remainingRelations);
      pruneSelectionByRemovedIds(idsToDelete);
      const removedRelationIds = new Set(
        distanceRelations
          .filter(
            (relation) =>
              !remainingRelations.some(
                (remainingRelation) => remainingRelation.id === relation.id
              )
          )
          .map((relation) => relation.id)
      );
      pruneMeasurementDraftSession(idsToDelete, removedRelationIds);
      setDoubleClickChainSourcePointId((prev) =>
        prev && idsToDelete.has(prev) ? null : prev
      );
      if (moveGizmoPointId && idsToDelete.has(moveGizmoPointId)) {
        clearMoveGizmo();
      }

      const remainingPointById = getPointPositionMap(annotations);
      idsToDelete.forEach((id) => remainingPointById.delete(id));
      setPlanarMeasurements((prev) =>
        prev.flatMap((group) => {
          const nextNodeIds = group.nodeIds.filter(
            (nodeId) => !idsToDelete.has(nodeId)
          );
          if (nextNodeIds.length < 3) {
            return [];
          }
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            group.closed,
            getDistanceRelationId
          );
          return [
            computePolygonGroupDerivedDataWithCamera(
              {
                ...group,
                nodeIds: nextNodeIds,
                edgeRelationIds: nextEdgeRelationIds,
              },
              remainingPointById
            ),
          ];
        })
      );
      setActivePlanarMeasurementId((prev) => {
        if (!prev) return prev;
        const activeGroup = planarPolygonGroups.find(
          (group) => group.id === prev
        );
        if (!activeGroup) return null;
        return activeGroup.nodeIds.some((id) => idsToDelete.has(id))
          ? null
          : prev;
      });
    },
    [
      distanceRelations,
      annotations,
      clearMoveGizmo,
      doubleClickChainSourcePointId,
      getOwnerGroupIdsForPointId,
      moveGizmoPointId,
      planarPolygonGroups,
      computePolygonGroupDerivedDataWithCamera,
      pruneMeasurementDraftSession,
      pruneSelectionByRemovedIds,
    ]
  );

  const deletePlanarPolygonGroupById = useCallback(
    (id: string) => {
      const group = planarPolygonGroups.find((entry) => entry.id === id);
      if (!group) {
        return;
      }

      const nodeIds = group.nodeIds.filter((nodeId): nodeId is string =>
        Boolean(nodeId)
      );
      if (nodeIds.length === 0) {
        return;
      }

      clearAnnotationsByIds(nodeIds);
    },
    [clearAnnotationsByIds, planarPolygonGroups]
  );

  const deleteAnnotationsByIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      const requestedIdSet = new Set(ids);
      const targetedPlanarGroups = planarPolygonGroups.filter((group) =>
        requestedIdSet.has(group.id)
      );
      const expandedAnnotationIdSet = new Set<string>(
        ids.filter(
          (id) => !targetedPlanarGroups.some((group) => group.id === id)
        )
      );

      targetedPlanarGroups.forEach((group) => {
        group.nodeIds.forEach((nodeId) => {
          expandedAnnotationIdSet.add(nodeId);
        });
      });

      clearAnnotationsByIds([...expandedAnnotationIdSet]);
    },
    [clearAnnotationsByIds, planarPolygonGroups]
  );

  const deleteSelectedAnnotations = useCallback(() => {
    const selectedIds = selectedAnnotationIds.filter(
      (id) => selectablePointIds.has(id) && !lockedMeasurementIdSet.has(id)
    );
    if (selectedIds.length > 0) {
      clearAnnotationsByIds(selectedIds);
      return;
    }
    if (
      selectedAnnotationId &&
      selectablePointIds.has(selectedAnnotationId) &&
      !lockedMeasurementIdSet.has(selectedAnnotationId)
    ) {
      clearAnnotationsByIds([selectedAnnotationId]);
    }
  }, [
    clearAnnotationsByIds,
    lockedMeasurementIdSet,
    selectablePointIds,
    selectedAnnotationId,
    selectedAnnotationIds,
  ]);

  const flyToAnnotationById = useCallback(
    (id: string) => {
      if (!id) return;
      const pointById = getPointPositionMap(annotations);
      const planarMeasurement =
        planarPolygonGroups.find((entry) => entry.id === id) ?? null;
      if (planarMeasurement) {
        const flyToPoints = planarMeasurement.nodeIds
          .map((pointId) => pointById.get(pointId) ?? null)
          .filter((point): point is Cartesian3 => Boolean(point));
        if (flyToPoints.length > 0) {
          flyToMeasurementPoints(scene, flyToPoints);
        }
        return;
      }

      const measurement = annotations.find((entry) => entry.id === id);
      if (!measurement) return;
      flyToMeasurementPoints(
        scene,
        getMeasurementEntryFlyToPoints(measurement)
      );
    },
    [annotations, planarPolygonGroups, scene]
  );

  const flyToAllAnnotations = useCallback(() => {
    if (annotations.length === 0) return;
    const points = annotations.flatMap(getMeasurementEntryFlyToPoints);
    flyToMeasurementPoints(scene, points);
  }, [annotations, scene]);

  useEffect(
    function effectPruneDistanceRelationsForRemovedPoints() {
      const pointEntryIdsForRelations = new Set(
        pointEntries.map((measurement) => measurement.id)
      );
      setDistanceRelations((prev) => {
        const next = prev
          .filter(
            (relation) =>
              pointEntryIdsForRelations.has(relation.pointAId) &&
              pointEntryIdsForRelations.has(relation.pointBId)
          )
          .map((relation) => {
            const fallbackAnchorPointId = relation.pointAId;
            const anchorPointId = pointEntryIdsForRelations.has(
              relation.anchorPointId
            )
              ? relation.anchorPointId
              : fallbackAnchorPointId;
            return {
              ...relation,
              anchorPointId,
            };
          });
        if (next.length !== prev.length) return next;
        for (let index = 0; index < next.length; index += 1) {
          if (next[index]?.anchorPointId !== prev[index]?.anchorPointId) {
            return next;
          }
        }
        return prev;
      });
    },
    [pointEntries]
  );

  useEffect(
    function effectPrunePolygonVerticesForRemovedPoints() {
      const pointEntryIdsForPolygons = new Set(
        pointEntries.map((measurement) => measurement.id)
      );
      const pointById = getPointPositionMap(annotations);
      setPlanarMeasurements((prev) => {
        let hasChanges = false;
        const nextGroups = prev.flatMap((group) => {
          const nextNodeIds = group.nodeIds.filter((nodeId) =>
            pointEntryIdsForPolygons.has(nodeId)
          );
          if (nextNodeIds.length === 0) {
            hasChanges = true;
            return [];
          }
          const nextClosed = group.closed && nextNodeIds.length >= 3;
          const nextEdgeRelationIds = buildEdgeRelationIdsForPolygon(
            nextNodeIds,
            nextClosed,
            getDistanceRelationId
          );
          const nextGroup = computePolygonGroupDerivedDataWithCamera(
            {
              ...group,
              nodeIds: nextNodeIds,
              edgeRelationIds: nextEdgeRelationIds,
              closed: nextClosed,
            },
            pointById
          );
          const groupChanged = !arePlanarPolygonGroupsEquivalent(
            group,
            nextGroup
          );
          if (groupChanged) {
            hasChanges = true;
          }
          return [groupChanged ? nextGroup : group];
        });
        return hasChanges ? nextGroups : prev;
      });
    },
    [annotations, computePolygonGroupDerivedDataWithCamera, pointEntries]
  );

  useEffect(
    function effectSyncReferencePointAfterPointDeletion() {
      if (!referencePoint) return;

      if (pointEntries.length === 0) {
        setReferencePoint(null);
        return;
      }

      const hasReferenceMeasurement = pointEntries.some(
        (measurement) =>
          Cartesian3.distance(measurement.geometryECEF, referencePoint) <=
          REFERENCE_POINT_SYNC_EPSILON_METERS
      );

      if (hasReferenceMeasurement) {
        return;
      }

      // Reference point was deleted: fallback to the latest remaining point.
      const nextReferencePoint =
        pointEntries[pointEntries.length - 1]?.geometryECEF ?? null;
      setReferencePoint(nextReferencePoint);
    },
    [pointEntries, referencePoint, setReferencePoint]
  );

  useEffect(
    function effectInitializeReferencePointFromPointEntries() {
      if (referencePoint !== null) return;
      // if more than one point measurement is present, set the reference point to the first one
      if (pointEntries.length > 1) {
        setReferencePoint(pointEntries[0]?.geometryECEF ?? null);
      }
    },
    [pointEntries, setReferencePoint, referencePoint]
  );

  const setReferencePointId = useCallback(
    (id: string | null) => {
      if (id === null) {
        setReferencePoint(null);
        return;
      }

      const referenceMeasurement =
        pointEntries.find((pointEntry) => pointEntry.id === id) ?? null;
      if (!referenceMeasurement) {
        return;
      }

      setReferencePoint(referenceMeasurement.geometryECEF);
    },
    [pointEntries, setReferencePoint]
  );

  const {
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
  } = useAnnotationsCollectionState(
    annotations,
    pointEntries,
    pointMeasureEntries,
    {
      distanceRelations,
      planarPolygonGroups,
    }
  );

  const addAnnotation = useCallback(
    (payload: AnnotationCreatePayload<AnnotationEntry>): string => {
      const generatedId =
        payload.id?.trim() ||
        `${payload.type}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
      const nextMeasurement: AnnotationEntry = {
        ...payload,
        id: generatedId,
        timestamp: payload.timestamp ?? Date.now(),
      };
      setAnnotations((prev) => [...prev, nextMeasurement]);
      return generatedId;
    },
    [setAnnotations]
  );

  const updateAnnotationById = useCallback(
    (id: string, patch: Partial<AnnotationEntry>) => {
      if (!id) return;
      setAnnotations((prev) => {
        let hasChanged = false;
        const next = prev.map((measurement) => {
          if (measurement.id !== id) return measurement;
          hasChanged = true;
          return {
            ...measurement,
            ...patch,
            id: measurement.id,
          };
        });
        return hasChanged ? next : prev;
      });
    },
    [setAnnotations]
  );

  const requestFinishLabelPlacementDraft = useCallback(() => {
    if (!labelInputPromptPointId) {
      return;
    }

    confirmLabelPlacementById(labelInputPromptPointId);
  }, [confirmLabelPlacementById, labelInputPromptPointId]);

  const requestCancelLabelPlacementDraft = useCallback(() => {
    if (!labelInputPromptPointId) {
      return;
    }

    clearAnnotationsByIds([labelInputPromptPointId]);
  }, [clearAnnotationsByIds, labelInputPromptPointId]);

  const pointMeasureModeSession = usePointMeasureModeSession(
    annotations,
    setAnnotations,
    clearAnnotationsByIds,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_POINT);
    }
  );
  const labelPlacementModeSession = useLabelPlacementModeSession(
    labelInputPromptPointId,
    () => {
      requestEnterToolType(ANNOTATION_TYPE_LABEL);
    },
    requestFinishLabelPlacementDraft,
    requestCancelLabelPlacementDraft
  );
  const toolSessions = useAnnotationToolSessions(
    pointMeasureModeSession,
    labelPlacementModeSession,
    {
      activePlanarMeasurementId,
      openChainPointId: doubleClickChainSourcePointId,
      selectablePointIds,
      selectedAnnotationId,
      distanceRelations,
      nodeChainMeasurements: planarPolygonGroups,
    },
    {
      requestEnterToolType,
      discardActiveMeasurementDraft,
      finishDistanceMeasurementSession,
      finishActivePlanarPolylineGroup,
      closeActivePlanarPolygonGroup,
    }
  );

  const {
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
  } = useAnnotationModeLifecycle(
    activeToolType,
    toolSessions,
    clearSharedModeExitState
  );

  const candidateAnnotation = useMemo<AnnotationEntry | null>(() => {
    const isPointCandidateMode = activeToolType === ANNOTATION_TYPE_POINT;
    const isDistanceCandidateMode = activeToolType === ANNOTATION_TYPE_DISTANCE;

    if (!isPointCandidateMode && !isDistanceCandidateMode) {
      return null;
    }
    if (!activeCandidateNodeECEF) {
      return null;
    }

    const previewPoint = getDegreesFromCartesian(activeCandidateNodeECEF);
    if (
      !Number.isFinite(previewPoint.latitude) ||
      !Number.isFinite(previewPoint.longitude)
    ) {
      return null;
    }

    const previewMeasurementType = isDistanceCandidateMode
      ? ANNOTATION_TYPE_DISTANCE
      : ANNOTATION_TYPE_POINT;

    return {
      id: "__candidate-measurement__",
      type: previewMeasurementType,
      timestamp: -1,
      isCandidate: true,
      geometryECEF: Cartesian3.clone(activeCandidateNodeECEF),
      geometryWGS84: {
        latitude: previewPoint.latitude,
        longitude: previewPoint.longitude,
        altitude: getEllipsoidalAltitudeOrZero(previewPoint.altitude),
      },
    };
  }, [activeCandidateNodeECEF, activeToolType]);
  const stopMoveGizmo = clearMoveGizmo;

  return {
    options,
    scene,
    annotations,
    annotationCandidate: candidateAnnotation,
    annotationsByType,
    getAnnotationsForNavigation,
    getAnnotationIndexByType,
    getAnnotationOrderByType,
    getNextAnnotationOrderByType,
    addAnnotation,
    updateAnnotationById,
    updateAnnotationNameById,
    updatePointLabelAppearanceById,
    deleteAnnotationsByIds,
    toggleAnnotationsLockByIds,
    selectionModeActive,
    setSelectionModeActive,
    selectModeAdditive,
    setSelectModeAdditive,
    setSelectModeRectangle,
    effectiveSelectModeAdditive,
    selectablePointIds,
    moveGizmoPointId,
    isMoveGizmoDragging,
    activeEditTarget,
    pointQueryEnabled,
    hasCandidateNode,
    isActiveDrawMode,
    distanceModeStickyToFirstPoint,
    activePlanarMeasurementId,
    planarPolygonGroups,
    polylineGroups,
    areaPolygonGroups,
    planarSurfacePolygonGroups,
    verticalPolygonGroups,
    polylines,
    selectAnnotationIds,
    selectAnnotationById,
    selectRepresentativeNodeForMeasurementId,
    focusAnnotationById,
    startMoveGizmoForMeasurementId,
    setMoveGizmoPointElevationFromMeasurementById,
    syncAnnotationCursorToExistingPoint,
    releaseAnnotationCursorSnap,
    scheduleAnnotationCursorSnapRelease,
    resolveDistanceRelationSourcePointId,
    appendExistingPointToActivePlanarPolygonGroup,
    upsertDirectDistanceRelation,
    closeActivePlanarPolygonGroup,
    finishActivePlanarPolylineGroup,
    finishDistanceMeasurementSession,
    setDoubleClickChainSourcePointId,
    selectedAnnotationId,
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
    toggleAnnotationsVisibilityByIds,
    handlePointQueryPointCreated,
    handlePointQueryDoubleClick,
    handlePointQueryBeforePointCreate,
    handleAnnotationCursorMove,
    visibleMeasurementsForRendering,
    pointRadius,
    moveGizmoAxisDirection,
    moveGizmoPreferredAxisId,
    moveGizmoVerticalOffsetEditMode,
    moveGizmoAxisCandidates,
    moveGizmoAxisTitle,
    setActiveEditTarget,
    clearActiveEditTarget,
    handleMoveGizmoPointPositionChange,
    setIsMoveGizmoDragging,
    handleMoveGizmoAxisChange,
    handleMoveGizmoExit,
    effectiveDistanceRelationsForRendering,
    visiblePlanarPolygonGroupsForRendering,
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
    selectedAnnotationIds,
    selectModeRectangle,
    moveGizmoOptions,
    handlePointLabelDoubleClick,
    handleDistanceRelationLineLabelToggle,
    handleDistanceRelationLineClick,
    handleDistanceRelationMidpointClick,
    handleDistanceRelationCornerClick,
    annotationCursorEnabled,
    activeCandidateNodeECEF,
    cursorScreenPosition,
    activeCandidateNodeSurfaceNormalECEF,
    activeCandidateNodeVerticalOffsetAnchorECEF,
    candidateConnectionPreview,
    candidatePreviewDistanceMeters,
    referencePoint,
    showDistanceAndPolygonVisuals,
    annotationSelection,
    rectangleSelection,
    lockedMeasurementIdSet,
    deleteSelectedAnnotations,
    clearAllAnnotations,
    clearAnnotationsByType,
    clearAnnotationsByIds,
    clearAnnotationSelection,
    clearActivePlanarDrawingState,
    clearMoveGizmo,
    setReferencePointId,
    pointMeasureEntries,
    activeToolType,
    requestModeChange,
    requestStartMeasurement,
    requestCloseActiveMeasurement,
    isInteractionActive,
    doubleClickChainSourcePointId,
    hasDistancePreviewAnchor,
    distanceRelations,
    confirmLabelPlacementById,
    flyToAnnotationById,
    flyToAllAnnotations,
    updatePlanarPolygonNameById,
    updateAnnotationVisualizerOptionsById,
    setPendingPolylinePromotionRingClosurePointId,
    focusedPlanarMeasurementId,
    activeMeasurementId,
    setPlanarMeasurements,
    updatePlanarPolygonSegmentLineModeById,
    togglePlanarPolygonGroupVisibilityById,
    togglePlanarPolygonGroupLockById,
    deletePlanarPolygonGroupById,
  };
};

export type AnnotationsManagementState = ReturnType<
  typeof useAnnotationsManagement
>;
