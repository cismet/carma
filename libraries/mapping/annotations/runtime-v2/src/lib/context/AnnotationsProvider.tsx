import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Provider as ReduxProvider } from "react-redux";

import {
  formatMeasurementShortLabelToken,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
  ANNOTATION_TYPE_POINT,
  SELECT_TOOL_TYPE,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";
import {
  BoundingSphere,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  type Cartesian2,
} from "@carma-cesium";
import {
  cartesian3FromGeographicCoordinate,
  flyToBoundingSphereExtent,
} from "@carma-mapping/engines/cesium/core";

import {
  useModeLifecycle,
  usePointQueryToolRouting,
  useToolSessions,
} from "../interaction/lifecycle";
import { useCursorOverlay } from "../interaction/useCursorOverlay";
import { usePointEditingGizmo } from "../interaction/usePointEditingGizmo";
import { usePointPreviewRingIndicator } from "../interaction/usePointPreviewRingIndicator";
import { useSceneCoordinateHandler } from "../interaction/useSceneCoordinateHandler";
import {
  type RuntimeCursorScreenPosition,
  type RuntimeRenderLayer,
} from "../render/runtimeRenderLayer";
import { useCommittedRuntimeVisualization } from "../render/useCommittedRuntimeVisualization";
import {
  appendAnnotationEntities,
  createAnnotationsStore,
  createInitialAnnotationsStoreState,
  finalizeTemporaryAnnotationsByToolType,
  removeAnnotationById,
  removeAnnotationsByIds,
  RUNTIME_ELEVATION_DISPLAY_MODE,
  setElevationReferenceAnnotationId as setElevationReferenceAnnotationIdAction,
  setAnnotationToolType,
  setPointTemporaryMode as setPointTemporaryModeInStoreAction,
  setSelectedAnnotationId,
  setSelectedAnnotationIds,
  updateAnnotationEntryById,
  AnnotationsReduxContext,
  useAnnotationsSelector,
  useAnnotationsStore,
  type AnnotationsStore,
  type AnnotationsStoreState,
  type RuntimeAddAnnotationOptions,
  type RuntimeAnnotationEntry,
  type RuntimeCoordinate,
  type RuntimeEdge,
  type RuntimeLinkedNodeGroup,
  type RuntimeLinkedNodeGroupId,
  type RuntimeMeasurement,
  type RuntimeNode,
} from "../store";
import {
  buildAnnotationToolRegistry,
  defaultAnnotationToolPlugins,
} from "../tools";
import type { AnnotationsRuntimeFormatOptions } from "../config/annotationsRuntimeFormatOptions";
import type { PreviewLineLabelVisualOptions } from "../config/previewLineLabelVisualDefaults";
import {
  buildAnnotationsRuntimePersistenceState,
  resolvePersistedAnnotationsStoreState,
  type AnnotationsRuntimePersistenceEnvelope,
} from "../persistence/annotationsRuntimePersistence";
import { RUNTIME_POINT_LABEL_COORDINATE_SELECTION } from "../render/measurementRenderModels";
import {
  resolveDistanceTriangleAnchorCoordinateRole,
  resolveDistanceTriangleAnchorCoordinateSelection,
  resolveOppositeDistanceTriangleAnchorCoordinateRole,
} from "../render/runtimeDistanceTriangleOverlay";
import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewSample,
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../tools/annotationToolPlugin.types";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";
import {
  buildRuntimeAnnotationGeoJsonFeatureCollection,
  resolveRuntimeAnnotationExportDescriptor,
  sanitizeRuntimeAnnotationExportFileSegment,
} from "../export/runtimeAnnotationGeoJsonExport";
import {
  isRuntimeShortLabelKind,
  resolveNextShortLabelCounterForToolType,
} from "../utils/runtimeShortLabelSequence";
type AnnotationsRuntimeServices = {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  formatOptions: AnnotationsRuntimeFormatOptions;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (
      | RuntimeLinkedNodeGroupId
      | null
      | undefined
    )[]
  ) => RuntimeMeasurement;
  setActiveToolType: (toolType: RuntimeToolId) => void;
  requestModeChange: (toolType: RuntimeToolId) => void;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestFinishMeasurement: () => boolean;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  focusAnnotationId: (annotationId: string | null) => void;
  flyToAnnotationById: (annotationId: string | null) => void;
  flyToAllAnnotations: () => void;
  removeAnnotationById: (annotationId: string) => void;
  exportAnnotationGeoJson: (annotationId: string) => void;
  toggleAnnotationVisibility: (annotationId: string) => void;
  toggleAnnotationLocked: (annotationId: string) => void;
  removeSelectedAnnotations: () => void;
  selectAllAnnotations: () => void;
  setElevationReferenceAnnotationId: (annotationId: string | null) => void;
  toggleAnnotationElevationDisplayMode: (annotationId: string) => void;
  updateAnnotationDisplayName: (
    annotationId: string,
    displayName: string
  ) => void;
  updateAnnotationShortLabel: (
    annotationId: string,
    shortLabel: string
  ) => void;
  setPointTemporaryMode: (temporaryMode: boolean) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setSelectedAnnotationIds: (annotationIds: readonly string[]) => void;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
};

type AnnotationsProviderProps = {
  scene: RuntimeScene | null;
  children?: ReactNode;
  initialActiveToolType?: RuntimeToolId;
  initialPointTemporaryMode?: boolean;
  plugins?: readonly AnnotationToolPlugin[];
  formatOptions?: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions?: Partial<PreviewLineLabelVisualOptions>;
  initialPersistenceState?: AnnotationsRuntimePersistenceEnvelope | null;
  onPersistenceStateChange?: (
    state: AnnotationsRuntimePersistenceEnvelope
  ) => void;
};

type AnnotationsReduxProviderProps = {
  store: AnnotationsStore;
  context: typeof AnnotationsReduxContext;
  children?: ReactNode;
};

const AnnotationsReduxProvider = ReduxProvider as unknown as (
  props: AnnotationsReduxProviderProps
) => ReactNode;

type RuntimeLifecycleHostApi = {
  requestModeChange: (toolType: RuntimeToolId) => void;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestFinishMeasurement: () => boolean;
};

const AnnotationsRuntimeContext =
  createContext<AnnotationsRuntimeServices | null>(null);

const useRequiredAnnotationsRuntimeServices = () => {
  const context = useContext(AnnotationsRuntimeContext);

  if (!context) {
    throw new Error(
      "useAnnotationsRuntime must be used within AnnotationsProvider."
    );
  }

  return context;
};

const selectSelectedAnnotationId = (state: {
  selectionState: { selectedAnnotationIds: readonly string[] };
}) =>
  state.selectionState.selectedAnnotationIds[
    state.selectionState.selectedAnnotationIds.length - 1
  ] ?? null;

const resolveRemovableSelectedAnnotationIds = (state: {
  selectionState: { selectedAnnotationIds: readonly string[] };
  annotationEntries: readonly RuntimeAnnotationEntry[];
}) => {
  const selectedAnnotationIdSet = new Set(
    state.selectionState.selectedAnnotationIds
  );

  return state.annotationEntries
    .filter(
      (annotationEntry) =>
        selectedAnnotationIdSet.has(annotationEntry.id) &&
        !annotationEntry.locked
    )
    .map((annotationEntry) => annotationEntry.id);
};

const isEditableKeyboardTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement);

const isSelectAllAnnotationsShortcut = (event: KeyboardEvent): boolean =>
  !event.defaultPrevented &&
  !event.altKey &&
  !isEditableKeyboardTarget(event.target) &&
  (event.ctrlKey || event.metaKey) &&
  event.key.toLowerCase() === "a";

const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestStartMeasurement: () => undefined,
  requestFinishMeasurement: () => false,
};

const POINT_TOOL_ID = "point";
const POINT_QUERY_DISC_RADIUS_METERS = 1;
const POINT_QUERY_DISC_SMOOTHING_SAMPLE_COUNT = 120;
const POINT_QUERY_DISC_SMOOTHING_WINDOW_MS = 500;
const POINT_QUERY_DISC_SMOOTHING_WEIGHT_DECAY_GAMMA = 3;
const HOVER_CLEAR_DELAY_MS = 34;
const RUNTIME_INFOBOX_FLY_TO_MIN_RADIUS_METERS = 80;
const RUNTIME_INFOBOX_FLY_TO_PADDING_FACTOR = 1.15;
const ADDITIVE_SELECTION_MODIFIER_KEY = "Shift";
const CURSOR_VISIBLE_SENTINEL: RuntimeCursorScreenPosition = {
  x: Number.NaN,
  y: Number.NaN,
};

const isRuntimeSceneSelectionTarget = ({
  pickedObject,
  edgeIds,
  polygonFillIds,
}: {
  pickedObject: unknown;
  edgeIds: ReadonlySet<string>;
  polygonFillIds: ReadonlySet<string>;
}) => {
  const pickedId =
    typeof pickedObject === "object" && pickedObject !== null
      ? (pickedObject as { id?: unknown }).id
      : undefined;

  if (typeof pickedId === "string") {
    return [...edgeIds].some(
      (edgeId) => pickedId === edgeId || pickedId.startsWith(`${edgeId}-`)
    );
  }

  if (
    typeof pickedId === "object" &&
    pickedId !== null &&
    "polygonGroupId" in pickedId
  ) {
    const polygonGroupId = (pickedId as { polygonGroupId?: unknown })
      .polygonGroupId;
    return (
      typeof polygonGroupId === "string" && polygonFillIds.has(polygonGroupId)
    );
  }

  return false;
};

const NAVIGABLE_MEASUREMENT_TOOL_TYPES: ReadonlySet<string> = new Set([
  ANNOTATION_TYPE_POINT,
  ANNOTATION_TYPE_DISTANCE,
  ANNOTATION_TYPE_AREA_GROUND,
  ANNOTATION_TYPE_AREA_PLANAR,
  ANNOTATION_TYPE_AREA_VERTICAL,
]);

const selectAdjacentRuntimeAnnotationEntryId = (
  annotationEntries: readonly RuntimeAnnotationEntry[],
  selectedAnnotationId: string | null,
  offset: -1 | 1
): string | null => {
  if (annotationEntries.length === 0) {
    return null;
  }

  const currentIndex = selectedAnnotationId
    ? annotationEntries.findIndex((entry) => entry.id === selectedAnnotationId)
    : -1;
  const fallbackIndex = offset > 0 ? 0 : annotationEntries.length - 1;
  const nextIndex =
    currentIndex < 0
      ? fallbackIndex
      : (currentIndex + offset + annotationEntries.length) %
        annotationEntries.length;

  return annotationEntries[nextIndex]?.id ?? null;
};

const resolveNextElevationDisplayMode = (
  currentMode: RuntimeAnnotationEntry["elevationDisplayMode"]
) =>
  currentMode === RUNTIME_ELEVATION_DISPLAY_MODE.ABSOLUTE
    ? RUNTIME_ELEVATION_DISPLAY_MODE.RELATIVE
    : RUNTIME_ELEVATION_DISPLAY_MODE.ABSOLUTE;

const resolveAnnotationEntryCartesianPoints = ({
  annotationEntries,
  nodes,
  annotationId,
}: {
  annotationEntries: readonly RuntimeAnnotationEntry[];
  nodes: readonly RuntimeNode[];
  annotationId: string | null;
}) => {
  if (!annotationId) {
    return [];
  }

  const annotationEntry =
    annotationEntries.find((entry) => entry.id === annotationId) ?? null;
  if (!annotationEntry) {
    return [];
  }

  const nodeCoordinateById = new Map(
    nodes.map((node) => [node.id, node.coordinate] as const)
  );

  return annotationEntry.nodeIds.flatMap((nodeId) => {
    const coordinate = nodeCoordinateById.get(nodeId);
    return coordinate ? [cartesian3FromGeographicCoordinate(coordinate)] : [];
  });
};

const flyToAnnotationPoints = ({
  scene,
  points,
}: {
  scene: RuntimeScene | null;
  points: readonly ReturnType<typeof cartesian3FromGeographicCoordinate>[];
}) => {
  if (!scene || scene.isDestroyed() || points.length === 0) {
    return;
  }

  const sphere = BoundingSphere.fromPoints([...points]);
  sphere.radius = Math.max(
    sphere.radius,
    RUNTIME_INFOBOX_FLY_TO_MIN_RADIUS_METERS
  );
  flyToBoundingSphereExtent(scene.camera, sphere, {
    minRange: RUNTIME_INFOBOX_FLY_TO_MIN_RADIUS_METERS,
    paddingFactor: RUNTIME_INFOBOX_FLY_TO_PADDING_FACTOR,
  });
};

const downloadGeoJsonFile = (
  fileName: string,
  featureCollection: ReturnType<
    typeof buildRuntimeAnnotationGeoJsonFeatureCollection
  >
) => {
  if (!featureCollection) {
    return;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const blob = new Blob([JSON.stringify(featureCollection, null, 2)], {
    type: "application/geo+json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 0);
};

const buildMeasurementEntities = ({
  toolType,
  coordinates,
  options,
  linkedNodeGroupIds,
  measurementSequenceRef,
  nodeSequenceRef,
  edgeSequenceRef,
}: {
  toolType: RuntimeMeasurement["toolType"];
  coordinates: readonly RuntimeCoordinate[];
  options?: RuntimeAddAnnotationOptions;
  linkedNodeGroupIds?: readonly (RuntimeLinkedNodeGroupId | null | undefined)[];
  measurementSequenceRef: React.MutableRefObject<number>;
  nodeSequenceRef: React.MutableRefObject<number>;
  edgeSequenceRef: React.MutableRefObject<number>;
}): {
  annotationEntry: RuntimeAnnotationEntry;
  nodes: readonly RuntimeNode[];
  linkedNodeGroups: readonly RuntimeLinkedNodeGroup[];
  edges: readonly RuntimeEdge[];
} => {
  measurementSequenceRef.current += 1;
  const annotationEntryId = `${toolType}-${measurementSequenceRef.current}`;
  const nodes = coordinates.map((coordinate) => {
    nodeSequenceRef.current += 1;
    const nodeId = `node-${nodeSequenceRef.current}`;

    return {
      id: nodeId,
      coordinate,
    };
  });
  const linkedNodeGroups = nodes.map((node, index) => {
    const linkedNodeGroupId = linkedNodeGroupIds?.[index];
    const normalizedLinkedNodeGroupId =
      typeof linkedNodeGroupId === "string" &&
      linkedNodeGroupId.trim().length > 0
        ? linkedNodeGroupId.trim()
        : node.id;

    return {
      id: normalizedLinkedNodeGroupId,
      nodeIds: [node.id],
    };
  });
  const edges = nodes.slice(0, -1).map((node, index) => {
    const endNode = nodes[index + 1];

    edgeSequenceRef.current += 1;

    return {
      id: `edge-${edgeSequenceRef.current}`,
      startNodeId: node.id,
      endNodeId: endNode.id,
    };
  });
  if (options?.closed && nodes.length >= 3) {
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];

    if (firstNode && lastNode) {
      edgeSequenceRef.current += 1;
      edges.push({
        id: `edge-${edgeSequenceRef.current}`,
        startNodeId: lastNode.id,
        endNodeId: firstNode.id,
      });
    }
  }
  const annotationEntry: RuntimeAnnotationEntry = {
    id: annotationEntryId,
    toolType,
    ...options,
    nodeIds: nodes.map((node) => node.id),
    edgeIds: edges.map((edge) => edge.id),
  };

  return {
    annotationEntry,
    nodes,
    linkedNodeGroups,
    edges,
  };
};

const readMaxNumericSuffix = (ids: readonly string[]): number =>
  ids.reduce((maxValue, id) => {
    const match = id.match(/(\d+)$/);
    const numericSuffix = match ? Number(match[1]) : Number.NaN;

    return Number.isFinite(numericSuffix)
      ? Math.max(maxValue, numericSuffix)
      : maxValue;
  }, 0);

const RuntimeToolAvailabilityGuard = ({
  registry,
  setActiveToolType,
}: {
  registry: AnnotationToolRegistry;
  setActiveToolType: (toolType: RuntimeToolId) => void;
}) => {
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );

  useEffect(() => {
    if (registry.getPlugin(activeToolType)) {
      return;
    }

    const fallbackToolType = registry.orderedDescriptors[0]?.id;
    if (!fallbackToolType) {
      return;
    }
    setActiveToolType(fallbackToolType);
  }, [activeToolType, registry, setActiveToolType]);

  return null;
};

const RuntimeInteractionHost = ({
  scene,
  registry,
  annotationsStore,
  setActiveToolTypeInStore,
  focusAdjacentAnnotationEntry,
  addAnnotation,
  setCursorScreenPosition,
  bindApi,
  activeMoveGizmoNodeId,
  formatOptions,
  previewLineLabelVisualOptions,
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  setActiveToolTypeInStore: (toolType: RuntimeToolId) => void;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions,
    linkedNodeGroupIds?: readonly (
      | RuntimeLinkedNodeGroupId
      | null
      | undefined
    )[]
  ) => RuntimeMeasurement;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  activeMoveGizmoNodeId: string | null;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
}) => {
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const pointTemporaryMode = useAnnotationsSelector(
    (annotationsState) => annotationsState.settingsState.pointTemporaryMode
  );
  const hoverClearTimeoutRef = useRef<number | null>(null);
  const activePreviewControllerRef =
    useRef<AnnotationToolPreviewController | null>(null);
  const latestHoverSampleRef = useRef<AnnotationToolPreviewSample | null>(null);

  const clearScheduledHoverReset = useCallback(() => {
    if (hoverClearTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(hoverClearTimeoutRef.current);
    hoverClearTimeoutRef.current = null;
  }, []);

  const sessionContext = useMemo(
    () => ({
      getState: annotationsStore.getState,
      dispatch: annotationsStore.dispatch,
      setActiveToolType: setActiveToolTypeInStore,
      addAnnotation,
    }),
    [
      addAnnotation,
      annotationsStore.dispatch,
      annotationsStore.getState,
      setActiveToolTypeInStore,
    ]
  );
  const toolSessions = useToolSessions(registry, sessionContext);
  const activePlugin = registry.getPlugin(activeToolType) ?? null;

  const previousPointTemporaryModeRef = useRef(pointTemporaryMode);
  useEffect(() => {
    const previousPointTemporaryMode = previousPointTemporaryModeRef.current;
    const currentPointTemporaryMode = pointTemporaryMode;
    if (previousPointTemporaryMode && !currentPointTemporaryMode) {
      annotationsStore.dispatch(
        finalizeTemporaryAnnotationsByToolType(POINT_TOOL_ID)
      );
    }
    previousPointTemporaryModeRef.current = currentPointTemporaryMode;
  }, [annotationsStore, pointTemporaryMode]);

  const {
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
  } = useModeLifecycle(activeToolType, toolSessions, () => {
    setCursorScreenPosition(null);
  });

  const {
    handlePointQueryPointCreated,
    resolvePointQueryCoordinate,
    activeToolSession,
  } = usePointQueryToolRouting({
    scene,
    nodes,
    linkedNodeGroups,
    activeToolType,
    toolSessions,
    getToolPlugin: (toolType) => registry.getPlugin(toolType) ?? null,
    sessionContext,
  });

  useEffect(() => {
    bindApi({
      requestModeChange,
      requestStartMeasurement,
      requestFinishMeasurement,
    });

    return () => {
      bindApi(NOOP_RUNTIME_LIFECYCLE_HOST_API);
    };
  }, [
    bindApi,
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
  ]);

  const pointQueryEnabled = Boolean(
    (activeToolSession?.onNodeCreated ||
      activePlugin?.pointQuery?.onPointCreated) &&
      !activeMoveGizmoNodeId
  );
  const pointPreviewRing = usePointPreviewRingIndicator(scene, {
    radius: POINT_QUERY_DISC_RADIUS_METERS,
    enabled: pointQueryEnabled,
    showNormalLine: true,
    tangentDiscVisualizerTrailSampleCount:
      POINT_QUERY_DISC_SMOOTHING_SAMPLE_COUNT,
    tangentDiscVisualizerSmoothingWindowMs:
      POINT_QUERY_DISC_SMOOTHING_WINDOW_MS,
    tangentDiscVisualizerWeightDecayGamma:
      POINT_QUERY_DISC_SMOOTHING_WEIGHT_DECAY_GAMMA,
  });

  useEffect(() => {
    activePreviewControllerRef.current?.destroy();
    const nextPreviewController =
      activePlugin?.preview?.createController({
        scene,
        annotationsStore,
        requestRender: () => {
          if (scene && !scene.isDestroyed()) {
            scene.requestRender();
          }
        },
        formatOptions,
        previewLineLabelVisualOptions,
      }) ?? null;
    activePreviewControllerRef.current = nextPreviewController;
    nextPreviewController?.setEnabled(pointQueryEnabled);
    nextPreviewController?.setHoverSample(
      pointQueryEnabled ? latestHoverSampleRef.current : null
    );

    return () => {
      activePreviewControllerRef.current?.destroy();
      activePreviewControllerRef.current = null;
    };
  }, [
    activePlugin,
    annotationsStore,
    formatOptions,
    pointQueryEnabled,
    previewLineLabelVisualOptions,
    scene,
  ]);

  useEffect(() => {
    activePreviewControllerRef.current?.setEnabled(pointQueryEnabled);
    if (!pointQueryEnabled) {
      activePreviewControllerRef.current?.setHoverSample(null);
    }
  }, [pointQueryEnabled]);

  useSceneCoordinateHandler(scene, {
    enabled: pointQueryEnabled,
    onCoordinate: handlePointQueryPointCreated,
    onLineFinish: activeToolSession?.finishesOnLoopClosure
      ? () => {
          requestFinishMeasurement();
        }
      : undefined,
    onScreenPositionChange: (screenPosition) => {
      setCursorScreenPosition(pointQueryEnabled ? screenPosition : null);
    },
    onHoverSampleChange: ({
      coordinate,
      screenPosition,
      pointECEF,
      surfaceNormalECEF,
    }) => {
      if (!pointQueryEnabled || !pointECEF || !coordinate) {
        clearScheduledHoverReset();
        hoverClearTimeoutRef.current = window.setTimeout(() => {
          hoverClearTimeoutRef.current = null;
          latestHoverSampleRef.current = null;
          activePreviewControllerRef.current?.setHoverSample(null);
          pointPreviewRing.clearPreview();
        }, HOVER_CLEAR_DELAY_MS);
        return;
      }

      clearScheduledHoverReset();
      latestHoverSampleRef.current = {
        coordinate: resolvePointQueryCoordinate(coordinate, screenPosition),
        screenPosition,
        pointECEF,
        surfaceNormalECEF,
      };
      pointPreviewRing.setPreview({
        pointECEF,
        surfaceNormalECEF,
      });
      activePreviewControllerRef.current?.setHoverSample(
        latestHoverSampleRef.current
      );
    },
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    clearScheduledHoverReset();
    setCursorScreenPosition(null);
    latestHoverSampleRef.current = null;
    activePreviewControllerRef.current?.setHoverSample(null);
    activePreviewControllerRef.current?.setEnabled(false);
    pointPreviewRing.clearPreview();
  }, [
    clearScheduledHoverReset,
    pointPreviewRing,
    pointQueryEnabled,
    setCursorScreenPosition,
  ]);

  useEffect(
    () => () => {
      clearScheduledHoverReset();
    },
    [clearScheduledHoverReset]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isSelectAllAnnotationsShortcut(event)) {
        const runtimeState = sessionContext.getState();
        const annotationIds = runtimeState.annotationEntries.map(
          (annotationEntry) => annotationEntry.id
        );

        if (annotationIds.length > 0) {
          sessionContext.dispatch(setSelectedAnnotationIds(annotationIds));
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      const isManagedKeyEvent = isManagedAnnotationKeyboardEvent(event, {
        allowRepeat: true,
      });
      const commonAction = isManagedKeyEvent
        ? resolveAnnotationCommonShortcutAction(event)
        : null;

      if (
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.DELETE_SELECTION ||
        commonAction === ANNOTATION_COMMON_SHORTCUT_ACTIONS.UNDO_LAST_POINT
      ) {
        const runtimeState = sessionContext.getState();
        const selectedAnnotationIds =
          runtimeState.selectionState.selectedAnnotationIds;

        if (selectedAnnotationIds.length > 0) {
          const removableAnnotationIds =
            resolveRemovableSelectedAnnotationIds(runtimeState);
          if (removableAnnotationIds.length > 0) {
            sessionContext.dispatch(
              removeAnnotationsByIds({
                annotationIds: removableAnnotationIds,
              })
            );
          }
          event.preventDefault();
          event.stopPropagation();
          return;
        }
      }

      if (
        commonAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.CANCEL_ACTIVE_TOOL &&
        activeToolType !== SELECT_TOOL_TYPE
      ) {
        activeToolSession?.discardDraft();
        setCursorScreenPosition(null);
        setActiveToolTypeInStore(SELECT_TOOL_TYPE);
        event.preventDefault();
        return;
      }

      if (
        commonAction ===
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_PREVIOUS_NAVIGATION_ITEM
      ) {
        focusAdjacentAnnotationEntry(-1);
        event.preventDefault();
        return;
      }

      if (
        commonAction ===
        ANNOTATION_COMMON_SHORTCUT_ACTIONS.FOCUS_NEXT_NAVIGATION_ITEM
      ) {
        focusAdjacentAnnotationEntry(1);
        event.preventDefault();
        return;
      }

      if (
        activePlugin?.keyboard?.onKeyDown({
          event,
          activeToolType,
          activeToolSession,
          requestFinishMeasurement,
          requestStartMeasurement,
          requestModeChange,
          sessionContext,
        })
      ) {
        return;
      }

      if (
        commonAction ===
          ANNOTATION_COMMON_SHORTCUT_ACTIONS.FINISH_MEASUREMENT &&
        requestFinishMeasurement()
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    activePlugin,
    activeToolSession,
    activeToolType,
    focusAdjacentAnnotationEntry,
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
    sessionContext,
    setActiveToolTypeInStore,
    setCursorScreenPosition,
  ]);

  return null;
};

const RuntimeVisualizationHost = ({
  scene,
  registry,
  onActiveMoveGizmoNodeIdChange,
  activeMoveGizmoNodeId,
  cursorOverlayVisible,
  blockCommittedLabelInteractions,
  formatOptions,
  previewLineLabelVisualOptions,
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  onActiveMoveGizmoNodeIdChange: (nodeId: string | null) => void;
  activeMoveGizmoNodeId: string | null;
  cursorOverlayVisible: boolean;
  blockCommittedLabelInteractions: boolean;
  formatOptions: AnnotationsRuntimeFormatOptions;
  previewLineLabelVisualOptions: Partial<PreviewLineLabelVisualOptions>;
}) => {
  const activeToolType = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationToolType
  );
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
  );
  const linkedNodeGroups = useAnnotationsSelector(
    (annotationsState) => annotationsState.linkedNodeGroups
  );
  const edges = useAnnotationsSelector(
    (annotationsState) => annotationsState.edges
  );
  const annotationEntries = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationEntries
  );
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (annotationsState) => annotationsState.selectionState.selectedAnnotationIds
  );
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (annotationsState) =>
      annotationsState.settingsState.elevationReferenceAnnotationId
  );
  const annotationsStore = useAnnotationsStore("RuntimeVisualizationHost");
  const [
    isSelectionAdditiveModifierPressed,
    setIsSelectionAdditiveModifierPressed,
  ] = useState(false);
  const isSelectionAdditiveModifierPressedRef = useRef(false);
  const syncSelectionAdditiveModifierPressed = useCallback(
    (nextIsPressed: boolean) => {
      isSelectionAdditiveModifierPressedRef.current = nextIsPressed;
      setIsSelectionAdditiveModifierPressed((currentIsPressed) =>
        currentIsPressed === nextIsPressed ? currentIsPressed : nextIsPressed
      );
    },
    []
  );
  const {
    handleNodeLongPress,
    handleReferenceNodeClick,
    handleReferenceEdgeClick,
  } = usePointEditingGizmo(scene, nodes, linkedNodeGroups, {
    annotationsStore,
    onActiveMoveGizmoNodeIdChange,
  });
  const handleDistanceTriangleCornerClick = useCallback(
    (measurementId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === measurementId);
      if (!targetEntry) {
        return;
      }

      const coordinates = targetEntry.nodeIds
        .map(
          (nodeId) =>
            annotationsStore.getState().nodes.find((node) => node.id === nodeId)
              ?.coordinate ?? null
        )
        .filter((coordinate): coordinate is RuntimeCoordinate =>
          Boolean(coordinate)
        );

      const currentTriangleAnchorCoordinateRole =
        targetEntry.distanceTriangleAnchorCoordinateRole ??
        resolveDistanceTriangleAnchorCoordinateRole(coordinates);

      const nextSelection =
        (targetEntry.distanceAnchorCoordinateSelection ??
          resolveDistanceTriangleAnchorCoordinateSelection(coordinates)) ===
        RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
          ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE
          : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE;

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId: measurementId,
          distanceAnchorCoordinateSelection: nextSelection,
          distanceTriangleAnchorCoordinateRole:
            resolveOppositeDistanceTriangleAnchorCoordinateRole(
              currentTriangleAnchorCoordinateRole
            ),
        })
      );
    },
    [annotationsStore]
  );
  const setElevationReferenceAnnotationId = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(
        setElevationReferenceAnnotationIdAction(annotationId)
      );
    },
    [annotationsStore]
  );
  const toggleAnnotationElevationDisplayMode = useCallback(
    (annotationId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === annotationId);
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          elevationDisplayMode: resolveNextElevationDisplayMode(
            targetEntry.elevationDisplayMode
          ),
        })
      );
    },
    [annotationsStore]
  );
  const handleMeasurementSelection = useCallback(
    (annotationId: string | null) => {
      if (!annotationId) {
        annotationsStore.dispatch(setSelectedAnnotationId(null));
        return;
      }

      if (!isSelectionAdditiveModifierPressedRef.current) {
        annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
        return;
      }

      const currentlySelectedAnnotationIds =
        annotationsStore.getState().selectionState.selectedAnnotationIds;
      const nextSelectedAnnotationIds = currentlySelectedAnnotationIds.includes(
        annotationId
      )
        ? currentlySelectedAnnotationIds.filter(
            (selectedAnnotationId) => selectedAnnotationId !== annotationId
          )
        : [...currentlySelectedAnnotationIds, annotationId];

      annotationsStore.dispatch(
        setSelectedAnnotationIds(nextSelectedAnnotationIds)
      );
    },
    [annotationsStore]
  );

  useEffect(() => {
    const syncModifierState = (event: KeyboardEvent) => {
      syncSelectionAdditiveModifierPressed(event.shiftKey);
    };

    const clearModifierState = () => {
      syncSelectionAdditiveModifierPressed(false);
    };

    const handlePointerDown = (event: PointerEvent) => {
      syncSelectionAdditiveModifierPressed(event.shiftKey);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === ADDITIVE_SELECTION_MODIFIER_KEY || event.shiftKey) {
        syncModifierState(event);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === ADDITIVE_SELECTION_MODIFIER_KEY || !event.shiftKey) {
        syncModifierState(event);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearModifierState();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("blur", clearModifierState);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("blur", clearModifierState);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [syncSelectionAdditiveModifierPressed]);

  const aggregatedRenderLayer = useMemo(() => {
    const pluginLayers = registry.plugins
      .map(
        (plugin) =>
          plugin.renderLayer?.build({
            nodes,
            edges,
            annotationEntries,
            elevationReferenceAnnotationId,
            selectedAnnotationId,
            selectedAnnotationIds,
            isSelectionAdditiveModifierPressed,
            setSelectedAnnotationId: handleMeasurementSelection,
            setElevationReferenceAnnotationId,
            toggleAnnotationElevationDisplayMode,
            onNodeLongPress: handleNodeLongPress,
            formatOptions,
          }) ?? null
      )
      .filter((layer): layer is RuntimeRenderLayer => Boolean(layer));
    const allLayers = [...pluginLayers];

    return {
      points: allLayers.flatMap((layer) => layer.points ?? []),
      edges: allLayers.flatMap((layer) => layer.edges ?? []),
      polygonFills: allLayers.flatMap((layer) => layer.polygonFills ?? []),
      pointLabels: allLayers.flatMap((layer) => layer.pointLabels ?? []),
    };
  }, [
    annotationEntries,
    edges,
    elevationReferenceAnnotationId,
    nodes,
    formatOptions,
    registry.plugins,
    selectedAnnotationId,
    selectedAnnotationIds,
    isSelectionAdditiveModifierPressed,
    handleMeasurementSelection,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    handleNodeLongPress,
  ]);

  const runtimeSceneSelectionEdgeIdSet = useMemo(
    () => new Set((aggregatedRenderLayer.edges ?? []).map((edge) => edge.id)),
    [aggregatedRenderLayer.edges]
  );
  const runtimeSceneSelectionPolygonFillIdSet = useMemo(
    () =>
      new Set(
        (aggregatedRenderLayer.polygonFills ?? []).map(
          (polygonFill) => polygonFill.id
        )
      ),
    [aggregatedRenderLayer.polygonFills]
  );

  useEffect(() => {
    if (!scene || scene.isDestroyed() || activeToolType !== SELECT_TOOL_TYPE) {
      return;
    }

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((event: { position: Cartesian2 }) => {
      if (
        annotationsStore.getState().selectionState.selectedAnnotationIds
          .length === 0
      ) {
        return;
      }

      const pickedObject = scene.pick(event.position);
      if (
        isRuntimeSceneSelectionTarget({
          pickedObject,
          edgeIds: runtimeSceneSelectionEdgeIdSet,
          polygonFillIds: runtimeSceneSelectionPolygonFillIdSet,
        })
      ) {
        return;
      }

      handleMeasurementSelection(null);
      scene.requestRender();
    }, ScreenSpaceEventType.LEFT_CLICK);

    return () => {
      if (!handler.isDestroyed()) {
        handler.destroy();
      }
    };
  }, [
    activeToolType,
    annotationsStore,
    handleMeasurementSelection,
    runtimeSceneSelectionEdgeIdSet,
    runtimeSceneSelectionPolygonFillIdSet,
    scene,
  ]);

  useCommittedRuntimeVisualization({
    scene,
    points: aggregatedRenderLayer.points ?? [],
    nodes,
    linkedNodeGroups,
    edges: aggregatedRenderLayer.edges ?? [],
    polygonFills: aggregatedRenderLayer.polygonFills ?? [],
    pointLabels: aggregatedRenderLayer.pointLabels ?? [],
    selectedAnnotationIds,
    formatOptions,
    previewLineLabelVisualOptions,
    activeMoveGizmoNodeId,
    blockLabelInteractions:
      blockCommittedLabelInteractions ||
      activeMoveGizmoNodeId !== null ||
      registry.getPlugin(activeToolType)?.kind === "measurement",
    onMeasurementSelect: handleMeasurementSelection,
    onNodeLongPress: handleNodeLongPress,
    onReferenceNodeClick: handleReferenceNodeClick,
    onReferenceEdgeClick: handleReferenceEdgeClick,
    onDistanceTriangleCornerClick: handleDistanceTriangleCornerClick,
  });

  useCursorOverlay(
    scene,
    cursorOverlayVisible ? CURSOR_VISIBLE_SENTINEL : null,
    {
      enabled: cursorOverlayVisible,
    }
  );
  useCursorOverlay(scene, null, {
    enabled:
      activeToolType === SELECT_TOOL_TYPE && isSelectionAdditiveModifierPressed,
    variant: "selection-additive-indicator",
  });

  return null;
};

export const AnnotationsProvider = ({
  scene,
  children,
  initialActiveToolType,
  initialPointTemporaryMode = false,
  plugins = defaultAnnotationToolPlugins,
  formatOptions = {},
  previewLineLabelVisualOptions = {},
  initialPersistenceState = null,
  onPersistenceStateChange,
}: AnnotationsProviderProps) => {
  const registry = useMemo(
    () => buildAnnotationToolRegistry(plugins),
    [plugins]
  );
  const fallbackToolType = registry.orderedDescriptors[0]?.id ?? null;

  if (!fallbackToolType) {
    throw new Error("AnnotationsProvider requires at least one tool plugin.");
  }

  const resolvedInitialToolType =
    initialActiveToolType && registry.getPlugin(initialActiveToolType)
      ? initialActiveToolType
      : fallbackToolType;
  const annotationsStoreRef = useRef<AnnotationsStore | null>(null);
  const lifecycleHostApiRef = useRef<RuntimeLifecycleHostApi>(
    NOOP_RUNTIME_LIFECYCLE_HOST_API
  );
  const lastSerializedPersistenceStateRef = useRef<string | null>(null);
  const measurementSequenceRef = useRef(0);
  const nodeSequenceRef = useRef(0);
  const edgeSequenceRef = useRef(0);

  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);
  const [cursorOverlayVisible, setCursorOverlayVisible] = useState(false);

  if (annotationsStoreRef.current === null) {
    const initialStoreState = initialPersistenceState
      ? resolvePersistedAnnotationsStoreState({
          initialToolType: resolvedInitialToolType,
          initialPointTemporaryMode,
          initialPersistenceState,
        })
      : createInitialAnnotationsStoreState({
          initialToolType: resolvedInitialToolType,
          initialPointTemporaryMode,
        });

    measurementSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.annotationEntries.map(
        (annotationEntry) => annotationEntry.id
      )
    );
    nodeSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.nodes.map((node) => node.id)
    );
    edgeSequenceRef.current = readMaxNumericSuffix(
      initialStoreState.edges.map((edge) => edge.id)
    );
    lastSerializedPersistenceStateRef.current = JSON.stringify(
      buildAnnotationsRuntimePersistenceState(initialStoreState)
    );
    annotationsStoreRef.current = createAnnotationsStore(initialStoreState);
  }

  const annotationsStore = annotationsStoreRef.current;

  const setActiveToolTypeInStore = useCallback(
    (toolType: RuntimeToolId) => {
      annotationsStore.dispatch(setAnnotationToolType(toolType));
    },
    [annotationsStore]
  );

  const setActiveToolType = useCallback(
    (toolType: RuntimeToolId) => {
      if (lifecycleHostApiRef.current === NOOP_RUNTIME_LIFECYCLE_HOST_API) {
        setActiveToolTypeInStore(toolType);
        return;
      }

      lifecycleHostApiRef.current.requestModeChange(toolType);
    },
    [setActiveToolTypeInStore]
  );

  const setSelectedAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
    },
    [annotationsStore]
  );

  const setSelectedAnnotationIdsInStore = useCallback(
    (annotationIds: readonly string[]) => {
      annotationsStore.dispatch(setSelectedAnnotationIds(annotationIds));
    },
    [annotationsStore]
  );

  const setElevationReferenceAnnotationIdInStore = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(
        setElevationReferenceAnnotationIdAction(annotationId)
      );
    },
    [annotationsStore]
  );

  const focusAdjacentAnnotationEntry = useCallback(
    (offset: -1 | 1) => {
      const runtimeState = annotationsStore.getState();
      const nextAnnotationId = selectAdjacentRuntimeAnnotationEntryId(
        runtimeState.annotationEntries,
        selectSelectedAnnotationId(runtimeState),
        offset
      );

      annotationsStore.dispatch(setSelectedAnnotationId(nextAnnotationId));
    },
    [annotationsStore]
  );

  const flyToAnnotationById = useCallback(
    (annotationId: string | null) => {
      const runtimeState = annotationsStore.getState();
      const points = resolveAnnotationEntryCartesianPoints({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId,
      });
      flyToAnnotationPoints({
        scene,
        points,
      });
    },
    [annotationsStore, scene]
  );

  const flyToAllAnnotations = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    const points = runtimeState.annotationEntries.flatMap((annotationEntry) =>
      resolveAnnotationEntryCartesianPoints({
        annotationEntries: runtimeState.annotationEntries,
        nodes: runtimeState.nodes,
        annotationId: annotationEntry.id,
      })
    );
    flyToAnnotationPoints({
      scene,
      points,
    });
  }, [annotationsStore, scene]);

  const focusAnnotationId = useCallback(
    (annotationId: string | null) => {
      annotationsStore.dispatch(setSelectedAnnotationId(annotationId));
      flyToAnnotationById(annotationId);
    },
    [annotationsStore, flyToAnnotationById]
  );

  const removeAnnotationEntryById = useCallback(
    (annotationId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === annotationId);
      if (targetEntry?.locked) {
        return;
      }

      annotationsStore.dispatch(
        removeAnnotationById({
          annotationId,
          nextSelectedAnnotationId: null,
        })
      );
    },
    [annotationsStore]
  );

  const removeSelectedAnnotationEntries = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    const removableAnnotationIds =
      resolveRemovableSelectedAnnotationIds(runtimeState);
    if (removableAnnotationIds.length === 0) {
      return;
    }

    annotationsStore.dispatch(
      removeAnnotationsByIds({
        annotationIds: removableAnnotationIds,
      })
    );
  }, [annotationsStore]);

  const exportAnnotationGeoJson = useCallback(
    (annotationId: string) => {
      const runtimeState = annotationsStore.getState();
      const annotation =
        runtimeState.annotationEntries.find(
          (entry) => entry.id === annotationId
        ) ?? null;
      if (!annotation) {
        return;
      }

      const coordinates = annotation.nodeIds
        .map(
          (nodeId) =>
            runtimeState.nodes.find((node) => node.id === nodeId)?.coordinate ??
            null
        )
        .filter((coordinate): coordinate is RuntimeCoordinate =>
          Boolean(coordinate)
        );
      const featureCollection = buildRuntimeAnnotationGeoJsonFeatureCollection({
        annotation,
        coordinates,
      });
      if (!featureCollection) {
        return;
      }

      const exportDescriptor =
        resolveRuntimeAnnotationExportDescriptor(annotation);
      const kindSegment = sanitizeRuntimeAnnotationExportFileSegment(
        exportDescriptor.kind
      );
      const nameSegment = sanitizeRuntimeAnnotationExportFileSegment(
        exportDescriptor.name
      );

      downloadGeoJsonFile(
        `annotation-${kindSegment}-${nameSegment}.geojson`,
        featureCollection
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationVisibility = useCallback(
    (annotationId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === annotationId);
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          hidden: !targetEntry.hidden,
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationLocked = useCallback(
    (annotationId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === annotationId);
      if (!targetEntry) {
        return;
      }

      const nextLocked = !targetEntry.locked;
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          locked: nextLocked,
        })
      );

      if (
        nextLocked &&
        targetEntry.nodeIds.includes(activeMoveGizmoNodeId ?? "")
      ) {
        setActiveMoveGizmoNodeId(null);
      }
    },
    [activeMoveGizmoNodeId, annotationsStore]
  );

  const selectAllAnnotationEntries = useCallback(() => {
    const runtimeState = annotationsStore.getState();
    annotationsStore.dispatch(
      setSelectedAnnotationIds(
        runtimeState.annotationEntries.map(
          (annotationEntry) => annotationEntry.id
        )
      )
    );
  }, [annotationsStore]);

  const updateAnnotationDisplayName = useCallback(
    (annotationId: string, displayName: string) => {
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          displayName: displayName.trim(),
        })
      );
    },
    [annotationsStore]
  );

  const updateAnnotationShortLabel = useCallback(
    (annotationId: string, shortLabel: string) => {
      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          shortLabel: shortLabel.trim(),
        })
      );
    },
    [annotationsStore]
  );

  const toggleAnnotationElevationDisplayMode = useCallback(
    (annotationId: string) => {
      const targetEntry = annotationsStore
        .getState()
        .annotationEntries.find((entry) => entry.id === annotationId);
      if (!targetEntry) {
        return;
      }

      annotationsStore.dispatch(
        updateAnnotationEntryById({
          annotationId,
          elevationDisplayMode: resolveNextElevationDisplayMode(
            targetEntry.elevationDisplayMode
          ),
        })
      );
    },
    [annotationsStore]
  );

  const setPointTemporaryModeInStore = useCallback(
    (temporaryMode: boolean) => {
      annotationsStore.dispatch(
        setPointTemporaryModeInStoreAction(temporaryMode)
      );
    },
    [annotationsStore]
  );

  const bindLifecycleHostApi = useCallback((api: RuntimeLifecycleHostApi) => {
    lifecycleHostApiRef.current = api;
  }, []);

  const addAnnotation = useCallback(
    (
      toolType: RuntimeMeasurement["toolType"],
      coordinates: readonly RuntimeCoordinate[],
      options?: RuntimeAddAnnotationOptions,
      linkedNodeGroupIds?: readonly (
        | RuntimeLinkedNodeGroupId
        | null
        | undefined
      )[]
    ) => {
      const runtimeStateBeforeInsert = annotationsStore.getState();
      let resolvedOptions = options;

      if (
        toolType === ANNOTATION_TYPE_DISTANCE &&
        options?.distanceAnchorCoordinateSelection === undefined &&
        scene &&
        !scene.isDestroyed()
      ) {
        const startCoordinate = coordinates[0];
        const endCoordinate = coordinates[coordinates.length - 1];

        if (startCoordinate && endCoordinate) {
          const startScreenPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            cartesian3FromGeographicCoordinate(startCoordinate)
          );
          const endScreenPosition = SceneTransforms.worldToWindowCoordinates(
            scene,
            cartesian3FromGeographicCoordinate(endCoordinate)
          );

          if (defined(startScreenPosition) && defined(endScreenPosition)) {
            resolvedOptions = {
              ...options,
              distanceAnchorCoordinateSelection:
                startScreenPosition.x <= endScreenPosition.x
                  ? RUNTIME_POINT_LABEL_COORDINATE_SELECTION.LEFTMOST_SCREEN_SPACE
                  : RUNTIME_POINT_LABEL_COORDINATE_SELECTION.RIGHTMOST_SCREEN_SPACE,
            };
          }
        }
      }

      if (isRuntimeShortLabelKind(toolType)) {
        const nextShortLabelCounter = resolveNextShortLabelCounterForToolType({
          annotationEntries: runtimeStateBeforeInsert.annotationEntries,
          toolType,
        });
        resolvedOptions = {
          ...resolvedOptions,
          shortLabel:
            resolvedOptions?.shortLabel?.trim() ||
            formatMeasurementShortLabelToken(toolType, nextShortLabelCounter),
        };
      }

      const { annotationEntry, nodes, linkedNodeGroups, edges } =
        buildMeasurementEntities({
          toolType,
          coordinates,
          options: resolvedOptions,
          linkedNodeGroupIds,
          measurementSequenceRef,
          nodeSequenceRef,
          edgeSequenceRef,
        });

      annotationsStore.dispatch(
        appendAnnotationEntities({
          annotationEntry,
          nodes,
          linkedNodeGroups,
          edges,
          selectAnnotationId: annotationEntry.id,
        })
      );
      return annotationEntry;
    },
    [annotationsStore, scene]
  );

  useEffect(() => {
    if (!onPersistenceStateChange) {
      return;
    }

    const emitPersistenceState = () => {
      const nextPersistenceState = buildAnnotationsRuntimePersistenceState(
        annotationsStore.getState()
      );
      const serializedPersistenceState = JSON.stringify(nextPersistenceState);
      if (
        serializedPersistenceState === lastSerializedPersistenceStateRef.current
      ) {
        return;
      }

      onPersistenceStateChange(nextPersistenceState);
      lastSerializedPersistenceStateRef.current = serializedPersistenceState;
    };

    const unsubscribe = annotationsStore.subscribe(emitPersistenceState);
    return () => {
      unsubscribe();
    };
  }, [annotationsStore, onPersistenceStateChange]);

  const services = useMemo<AnnotationsRuntimeServices>(
    () => ({
      scene,
      registry,
      annotationsStore,
      formatOptions,
      addAnnotation,
      setActiveToolType,
      requestModeChange: (toolType) =>
        lifecycleHostApiRef.current.requestModeChange(toolType),
      requestStartMeasurement: (toolType) =>
        lifecycleHostApiRef.current.requestStartMeasurement(toolType),
      requestFinishMeasurement: () =>
        lifecycleHostApiRef.current.requestFinishMeasurement(),
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      flyToAnnotationById,
      flyToAllAnnotations,
      removeAnnotationById: removeAnnotationEntryById,
      exportAnnotationGeoJson,
      toggleAnnotationVisibility,
      toggleAnnotationLocked,
      removeSelectedAnnotations: removeSelectedAnnotationEntries,
      selectAllAnnotations: selectAllAnnotationEntries,
      setElevationReferenceAnnotationId:
        setElevationReferenceAnnotationIdInStore,
      toggleAnnotationElevationDisplayMode,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
      setPointTemporaryMode: setPointTemporaryModeInStore,
      setSelectedAnnotationId: setSelectedAnnotationIdInStore,
      setSelectedAnnotationIds: setSelectedAnnotationIdsInStore,
      setCursorScreenPosition: (cursorScreenPosition) =>
        setCursorOverlayVisible(cursorScreenPosition !== null),
    }),
    [
      addAnnotation,
      annotationsStore,
      focusAdjacentAnnotationEntry,
      focusAnnotationId,
      exportAnnotationGeoJson,
      flyToAllAnnotations,
      flyToAnnotationById,
      formatOptions,
      removeAnnotationEntryById,
      removeSelectedAnnotationEntries,
      registry,
      scene,
      selectAllAnnotationEntries,
      setElevationReferenceAnnotationIdInStore,
      setActiveToolType,
      setPointTemporaryModeInStore,
      setSelectedAnnotationIdInStore,
      setSelectedAnnotationIdsInStore,
      toggleAnnotationLocked,
      toggleAnnotationElevationDisplayMode,
      toggleAnnotationVisibility,
      updateAnnotationDisplayName,
      updateAnnotationShortLabel,
    ]
  );

  return (
    <AnnotationsReduxProvider
      context={AnnotationsReduxContext}
      store={annotationsStore}
    >
      <AnnotationsRuntimeContext.Provider value={services}>
        <RuntimeToolAvailabilityGuard
          registry={registry}
          setActiveToolType={setActiveToolType}
        />
        <RuntimeInteractionHost
          scene={scene}
          registry={registry}
          annotationsStore={annotationsStore}
          setActiveToolTypeInStore={setActiveToolTypeInStore}
          focusAdjacentAnnotationEntry={focusAdjacentAnnotationEntry}
          addAnnotation={addAnnotation}
          setCursorScreenPosition={(cursorScreenPosition) =>
            setCursorOverlayVisible(cursorScreenPosition !== null)
          }
          activeMoveGizmoNodeId={activeMoveGizmoNodeId}
          formatOptions={formatOptions}
          previewLineLabelVisualOptions={previewLineLabelVisualOptions}
          bindApi={bindLifecycleHostApi}
        />
        <RuntimeVisualizationHost
          scene={scene}
          registry={registry}
          onActiveMoveGizmoNodeIdChange={setActiveMoveGizmoNodeId}
          activeMoveGizmoNodeId={activeMoveGizmoNodeId}
          cursorOverlayVisible={cursorOverlayVisible}
          blockCommittedLabelInteractions={cursorOverlayVisible}
          formatOptions={formatOptions}
          previewLineLabelVisualOptions={previewLineLabelVisualOptions}
        />
        {children}
      </AnnotationsRuntimeContext.Provider>
    </AnnotationsReduxProvider>
  );
};

export const useAnnotationsRuntime = () => {
  const {
    scene,
    registry,
    formatOptions,
    addAnnotation,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    setPointTemporaryMode,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    setCursorScreenPosition,
  } = useRequiredAnnotationsRuntimeServices();
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const nodes = useAnnotationsSelector((state) => state.nodes);
  const edges = useAnnotationsSelector((state) => state.edges);
  const annotationEntries = useAnnotationsSelector(
    (state) => state.annotationEntries
  );
  const selectedAnnotationId = useAnnotationsSelector(
    selectSelectedAnnotationId
  );
  const selectedAnnotationIds = useAnnotationsSelector(
    (state) => state.selectionState.selectedAnnotationIds
  );
  const elevationReferenceAnnotationId = useAnnotationsSelector(
    (state) => state.settingsState.elevationReferenceAnnotationId
  );
  const pointTemporaryMode = useAnnotationsSelector(
    (state) => state.settingsState.pointTemporaryMode
  );

  return {
    scene,
    registry,
    formatOptions,
    activeToolType,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    focusAnnotationId,
    flyToAnnotationById,
    flyToAllAnnotations,
    removeAnnotationById,
    exportAnnotationGeoJson,
    toggleAnnotationVisibility,
    toggleAnnotationLocked,
    removeSelectedAnnotations,
    selectAllAnnotations,
    elevationReferenceAnnotationId,
    setElevationReferenceAnnotationId,
    toggleAnnotationElevationDisplayMode,
    updateAnnotationDisplayName,
    updateAnnotationShortLabel,
    pointTemporaryMode,
    setPointTemporaryMode,
    nodes,
    edges,
    annotationEntries,
    selectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationId,
    setSelectedAnnotationIds,
    addAnnotation,
    setCursorScreenPosition,
  };
};

export const useRuntimeCursor = (
  cursorScreenPosition: { x: number; y: number } | null,
  enabled: boolean
) => {
  const { setCursorScreenPosition } = useRequiredAnnotationsRuntimeServices();

  useEffect(() => {
    setCursorScreenPosition(enabled ? cursorScreenPosition : null);
  }, [cursorScreenPosition, enabled, setCursorScreenPosition]);

  useEffect(
    () => () => {
      setCursorScreenPosition(null);
    },
    [setCursorScreenPosition]
  );
};

export type {
  RuntimeAnnotationEntry,
  RuntimeCoordinate,
  RuntimeEdge,
  RuntimeLinkedNodeGroupId,
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";
export type { RuntimeRenderLayer } from "../render/runtimeRenderLayer";
