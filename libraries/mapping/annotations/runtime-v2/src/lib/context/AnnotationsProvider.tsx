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

import { registerCesiumSceneSurfacePickingTileset } from "@carma-mapping/engines/cesium/core";
import { type Cesium3DTileset } from "@carma-cesium";
import {
  ANNOTATION_COMMON_SHORTCUT_ACTIONS,
  SELECT_TOOL_TYPE,
  isManagedAnnotationKeyboardEvent,
  resolveAnnotationCommonShortcutAction,
} from "@carma-mapping/annotations/core";

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
  setAnnotationToolType,
  setPointTemporaryMode as setPointTemporaryModeInStoreAction,
  setSelectionModeActive,
  setSelectedAnnotationId,
  AnnotationsReduxContext,
  useAnnotationsSelector,
  useAnnotationsStore,
  type AnnotationsStore,
  type AnnotationsStoreState,
  type RuntimeAddAnnotationOptions,
  type RuntimeAnnotationEntry,
  type RuntimeCoordinate,
  type RuntimeEdge,
  type RuntimeMeasurement,
  type RuntimeNode,
} from "../store";
import {
  buildAnnotationToolRegistry,
  defaultAnnotationToolPlugins,
} from "../tools";
import type {
  AnnotationToolPreviewController,
  AnnotationToolPreviewSample,
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../tools/annotationToolPlugin.types";
import type { RuntimeScene } from "../types/runtimeScene.types";
import type { RuntimeToolId } from "../types/runtimeTool.types";
type AnnotationsRuntimeServices = {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
  setActiveToolType: (toolType: RuntimeToolId) => void;
  requestModeChange: (toolType: RuntimeToolId) => void;
  requestStartMeasurement: (toolType?: RuntimeToolId) => void;
  requestFinishMeasurement: () => boolean;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  setPointTemporaryMode: (temporaryMode: boolean) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
};

type AnnotationsProviderProps = {
  scene: RuntimeScene | null;
  surfacePickingTarget?: Cesium3DTileset | null;
  children?: ReactNode;
  initialActiveToolType?: RuntimeToolId;
  initialPointTemporaryMode?: boolean;
  plugins?: readonly AnnotationToolPlugin[];
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
const CURSOR_VISIBLE_SENTINEL: RuntimeCursorScreenPosition = {
  x: Number.NaN,
  y: Number.NaN,
};

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

const buildMeasurementEntities = ({
  toolType,
  coordinates,
  options,
  measurementSequenceRef,
  nodeSequenceRef,
  edgeSequenceRef,
}: {
  toolType: RuntimeMeasurement["toolType"];
  coordinates: readonly RuntimeCoordinate[];
  options?: RuntimeAddAnnotationOptions;
  measurementSequenceRef: React.MutableRefObject<number>;
  nodeSequenceRef: React.MutableRefObject<number>;
  edgeSequenceRef: React.MutableRefObject<number>;
}): {
  annotationEntry: RuntimeAnnotationEntry;
  nodes: readonly RuntimeNode[];
  edges: readonly RuntimeEdge[];
} => {
  measurementSequenceRef.current += 1;
  const annotationEntryId = `${toolType}-${measurementSequenceRef.current}`;
  const nodes = coordinates.map((coordinate) => {
    nodeSequenceRef.current += 1;

    return {
      id: `node-${nodeSequenceRef.current}`,
      coordinate,
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
    edges,
  };
};

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
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  setActiveToolTypeInStore: (toolType: RuntimeToolId) => void;
  focusAdjacentAnnotationEntry: (offset: -1 | 1) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  activeMoveGizmoNodeId: string | null;
}) => {
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
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

  useEffect(() => {
    annotationsStore.dispatch(
      setSelectionModeActive(activePlugin?.kind === "interaction")
    );
  }, [activePlugin?.kind, annotationsStore]);

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
  }, [activePlugin, annotationsStore, pointQueryEnabled, scene]);

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
        const selectedAnnotationId =
          runtimeState.selectionState.selectedAnnotationIds[
            runtimeState.selectionState.selectedAnnotationIds.length - 1
          ] ?? null;

        if (selectedAnnotationId) {
          sessionContext.dispatch(
            removeAnnotationById({
              annotationId: selectedAnnotationId,
              nextSelectedAnnotationId: null,
            })
          );
          event.preventDefault();
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
  setSelectedAnnotationId,
  onActiveMoveGizmoNodeIdChange,
  cursorOverlayVisible,
  blockCommittedLabelInteractions,
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  onActiveMoveGizmoNodeIdChange: (nodeId: string | null) => void;
  cursorOverlayVisible: boolean;
  blockCommittedLabelInteractions: boolean;
}) => {
  const activeToolType = useAnnotationsSelector(
    (annotationsState) => annotationsState.annotationToolType
  );
  const nodes = useAnnotationsSelector(
    (annotationsState) => annotationsState.nodes
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
  const annotationsStore = useAnnotationsStore("RuntimeVisualizationHost");
  const { handleNodeLongPress } = usePointEditingGizmo(scene, nodes, {
    annotationsStore,
    setSelectedAnnotationId,
    onActiveMoveGizmoNodeIdChange,
  });

  const aggregatedRenderLayer = useMemo(() => {
    const pluginLayers = registry.plugins
      .map(
        (plugin) =>
          plugin.renderLayer?.build({
            nodes,
            edges,
            annotationEntries,
            selectedAnnotationId,
            setSelectedAnnotationId,
            onNodeLongPress: handleNodeLongPress,
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
    nodes,
    registry.plugins,
    selectedAnnotationId,
    setSelectedAnnotationId,
    handleNodeLongPress,
  ]);

  useCommittedRuntimeVisualization({
    scene,
    points: aggregatedRenderLayer.points ?? [],
    edges: aggregatedRenderLayer.edges ?? [],
    polygonFills: aggregatedRenderLayer.polygonFills ?? [],
    pointLabels: aggregatedRenderLayer.pointLabels ?? [],
    blockLabelInteractions:
      blockCommittedLabelInteractions ||
      registry.getPlugin(activeToolType)?.kind === "measurement",
    onNodeLongPress: handleNodeLongPress,
  });

  useCursorOverlay(
    scene,
    cursorOverlayVisible ? CURSOR_VISIBLE_SENTINEL : null,
    {
      enabled: cursorOverlayVisible,
    }
  );

  return null;
};

export const AnnotationsProvider = ({
  scene,
  surfacePickingTarget = null,
  children,
  initialActiveToolType,
  initialPointTemporaryMode = false,
  plugins = defaultAnnotationToolPlugins,
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
  const measurementSequenceRef = useRef(0);
  const nodeSequenceRef = useRef(0);
  const edgeSequenceRef = useRef(0);

  useEffect(() => {
    if (!scene || scene.isDestroyed() || !surfacePickingTarget) {
      return;
    }

    return registerCesiumSceneSurfacePickingTileset(
      scene,
      surfacePickingTarget
    );
  }, [scene, surfacePickingTarget]);
  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<
    string | null
  >(null);
  const [cursorOverlayVisible, setCursorOverlayVisible] = useState(false);

  if (annotationsStoreRef.current === null) {
    annotationsStoreRef.current = createAnnotationsStore(
      createInitialAnnotationsStoreState({
        initialToolType: resolvedInitialToolType,
        initialPointTemporaryMode,
        initialSelectionModeActive:
          registry.getPlugin(resolvedInitialToolType)?.kind === "interaction",
      })
    );
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
      options?: RuntimeAddAnnotationOptions
    ) => {
      const { annotationEntry, nodes, edges } = buildMeasurementEntities({
        toolType,
        coordinates,
        options,
        measurementSequenceRef,
        nodeSequenceRef,
        edgeSequenceRef,
      });

      annotationsStore.dispatch(
        appendAnnotationEntities({
          annotationEntry,
          nodes,
          edges,
          selectAnnotationId: annotationEntry.id,
        })
      );

      return annotationEntry;
    },
    [annotationsStore]
  );

  const services = useMemo<AnnotationsRuntimeServices>(
    () => ({
      scene,
      registry,
      annotationsStore,
      addAnnotation,
      setActiveToolType,
      requestModeChange: (toolType) =>
        lifecycleHostApiRef.current.requestModeChange(toolType),
      requestStartMeasurement: (toolType) =>
        lifecycleHostApiRef.current.requestStartMeasurement(toolType),
      requestFinishMeasurement: () =>
        lifecycleHostApiRef.current.requestFinishMeasurement(),
      focusAdjacentAnnotationEntry,
      setPointTemporaryMode: setPointTemporaryModeInStore,
      setSelectedAnnotationId: setSelectedAnnotationIdInStore,
      setCursorScreenPosition: (cursorScreenPosition) =>
        setCursorOverlayVisible(cursorScreenPosition !== null),
    }),
    [
      addAnnotation,
      annotationsStore,
      focusAdjacentAnnotationEntry,
      registry,
      scene,
      setActiveToolType,
      setPointTemporaryModeInStore,
      setSelectedAnnotationIdInStore,
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
          bindApi={bindLifecycleHostApi}
        />
        <RuntimeVisualizationHost
          scene={scene}
          registry={registry}
          setSelectedAnnotationId={setSelectedAnnotationIdInStore}
          onActiveMoveGizmoNodeIdChange={setActiveMoveGizmoNodeId}
          cursorOverlayVisible={cursorOverlayVisible}
          blockCommittedLabelInteractions={cursorOverlayVisible}
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
    addAnnotation,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    setPointTemporaryMode,
    setSelectedAnnotationId,
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
  const pointTemporaryMode = useAnnotationsSelector(
    (state) => state.settingsState.pointTemporaryMode
  );

  return {
    scene,
    registry,
    activeToolType,
    setActiveToolType,
    requestModeChange,
    requestStartMeasurement,
    requestFinishMeasurement,
    focusAdjacentAnnotationEntry,
    pointTemporaryMode,
    setPointTemporaryMode,
    nodes,
    edges,
    annotationEntries,
    selectedAnnotationId,
    setSelectedAnnotationId,
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
  RuntimeMeasurement,
  RuntimeNode,
} from "../store";
export type { RuntimeRenderLayer } from "../render/runtimeRenderLayer";
