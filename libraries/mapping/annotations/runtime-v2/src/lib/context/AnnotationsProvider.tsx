import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { Provider as ReduxProvider } from "react-redux";
import {
  Cartesian3,
  getDegreesFromCartesian,
  getEllipsoidalAltitudeOrZero,
} from "@carma/cesium";
import {
  ANNOTATION_TYPE_AREA_VERTICAL,
  buildVerticalRectangleCornerFromDiagonal,
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
import { MeasurementPrimitivesVisualizer } from "../render/MeasurementPrimitivesVisualizer";
import { RuntimePointLabelVisualizer } from "../render/RuntimePointLabelVisualizer";
import { useOverlayPositionSync } from "../render/useOverlayPositionSync";
import {
  areRuntimeCursorScreenPositionsEqual,
  areRuntimeRenderLayersEqual,
  type RuntimeCursorScreenPosition,
  type RuntimeRenderLayer,
} from "../render/runtimeRenderLayer";
import { runtimeMeasurementVisualDefaults } from "../config/measurementVisualDefaults";
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
  useAnnotationsSelector,
  type AnnotationsStore,
  type AnnotationsStoreState,
  type RuntimeAddAnnotationOptions,
  type RuntimeAnnotationEntry,
  type RuntimeCoordinate,
  type RuntimeEdge,
  type RuntimeMeasurement,
  type RuntimeNode,
} from "../store";
import type { RuntimeToolId } from "../types/runtimeTool.types";
import type { RuntimeScene } from "../types/runtimeScene.types";
import {
  buildAnnotationToolRegistry,
  defaultAnnotationToolPlugins,
} from "../tools";
import type {
  AnnotationToolPlugin,
  AnnotationToolRegistry,
} from "../tools/annotationToolPlugin.types";

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
  setPointTemporaryMode: (temporaryMode: boolean) => void;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  setRenderLayer: (layerId: string, layer: RuntimeRenderLayer) => void;
  clearRenderLayer: (layerId: string) => void;
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
};

type RuntimeRenderHostState = {
  renderLayers: Readonly<Record<string, RuntimeRenderLayer>>;
  cursorScreenPosition: RuntimeCursorScreenPosition;
};

type RuntimeRenderHostApi = {
  setRenderLayer: (layerId: string, layer: RuntimeRenderLayer) => void;
  clearRenderLayer: (layerId: string) => void;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
};

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

const NOOP_RUNTIME_RENDER_HOST_API: RuntimeRenderHostApi = {
  setRenderLayer: () => undefined,
  clearRenderLayer: () => undefined,
  setCursorScreenPosition: () => undefined,
};

const NOOP_RUNTIME_LIFECYCLE_HOST_API: RuntimeLifecycleHostApi = {
  requestModeChange: () => undefined,
  requestStartMeasurement: () => undefined,
  requestFinishMeasurement: () => false,
};

const POINT_QUERY_PREVIEW_LAYER_ID = "runtime-point-query-preview";
const POINT_TOOL_ID = "point";
const DISTANCE_TOOL_ID = "distance";
const POLYLINE_TOOL_ID = "polyline";
const VERTICAL_AREA_TOOL_ID = ANNOTATION_TYPE_AREA_VERTICAL;
const POINT_QUERY_DISC_RADIUS_METERS = 1;
const NODE_LABEL_LONG_PRESS_DURATION_MS = 320;

const cartesianFromRuntimeCoordinate = ({
  longitude,
  latitude,
  altitude,
}: RuntimeCoordinate): Cartesian3 =>
  Cartesian3.fromDegrees(longitude, latitude, altitude);

const runtimeCoordinateFromCartesian = (
  coordinateECEF: Cartesian3
): RuntimeCoordinate => {
  const coordinateWgs84 = getDegreesFromCartesian(coordinateECEF);

  return {
    longitude: coordinateWgs84.longitude,
    latitude: coordinateWgs84.latitude,
    altitude: getEllipsoidalAltitudeOrZero(coordinateWgs84.altitude),
  };
};

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
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

const buildPointQueryPreviewRenderLayer = ({
  activeToolType,
  state,
  pointQueryEnabled,
  hoverCoordinate,
}: {
  activeToolType: RuntimeToolId;
  state: AnnotationsStoreState;
  pointQueryEnabled: boolean;
  hoverCoordinate: RuntimeCoordinate | null;
}): RuntimeRenderLayer | null => {
  if (!pointQueryEnabled || !hoverCoordinate) {
    return null;
  }

  const defaults = runtimeMeasurementVisualDefaults;
  const points = [
    {
      id: `${POINT_QUERY_PREVIEW_LAYER_ID}-point`,
      coordinate: hoverCoordinate,
      pixelSize: defaults.sizes.previewPointPixelSize,
      fill: defaults.colors.preview,
      outline: defaults.colors.surface,
      outlineWidth: defaults.sizes.pointOutlineWidth,
    },
  ];

  const activeDraftCoordinates =
    activeToolType === DISTANCE_TOOL_ID
      ? state.draftState.distancePreviewCoordinates
      : activeToolType === POLYLINE_TOOL_ID
      ? state.draftState.polylinePreviewCoordinates
      : activeToolType === VERTICAL_AREA_TOOL_ID
      ? state.draftState.verticalAreaPreviewCoordinates
      : [];

  if (activeToolType === VERTICAL_AREA_TOOL_ID) {
    const firstCorner = activeDraftCoordinates[0] ?? null;

    if (!firstCorner) {
      return {
        points,
        edges: [],
        pointLabels: [],
      };
    }

    const firstCornerECEF = cartesianFromRuntimeCoordinate(firstCorner);
    const oppositeCornerECEF = cartesianFromRuntimeCoordinate(hoverCoordinate);
    const verticalCorners = buildVerticalRectangleCornerFromDiagonal(
      firstCornerECEF,
      oppositeCornerECEF
    );

    if (!verticalCorners) {
      return {
        points: [
          {
            id: `${POINT_QUERY_PREVIEW_LAYER_ID}-point-first`,
            coordinate: firstCorner,
            pixelSize: defaults.sizes.previewPointPixelSize,
            fill: defaults.colors.preview,
            outline: defaults.colors.surface,
            outlineWidth: defaults.sizes.pointOutlineWidth,
          },
          ...points,
        ],
        edges: [
          {
            id: `${POINT_QUERY_PREVIEW_LAYER_ID}-edge`,
            coordinates: [firstCorner, hoverCoordinate],
            stroke: defaults.colors.preview,
            strokeWidth: defaults.sizes.edgeStrokeWidth,
            dashed: true,
          },
        ],
        pointLabels: [],
      };
    }

    const adjacentHorizontalCorner = runtimeCoordinateFromCartesian(
      verticalCorners.adjacentHorizontalCorner
    );
    const adjacentVerticalCorner = runtimeCoordinateFromCartesian(
      verticalCorners.adjacentVerticalCorner
    );

    return {
      points: [
        {
          id: `${POINT_QUERY_PREVIEW_LAYER_ID}-point-first`,
          coordinate: firstCorner,
          pixelSize: defaults.sizes.previewPointPixelSize,
          fill: defaults.colors.preview,
          outline: defaults.colors.surface,
          outlineWidth: defaults.sizes.pointOutlineWidth,
        },
        {
          id: `${POINT_QUERY_PREVIEW_LAYER_ID}-point-horizontal`,
          coordinate: adjacentHorizontalCorner,
          pixelSize: defaults.sizes.previewPointPixelSize,
          fill: defaults.colors.preview,
          outline: defaults.colors.surface,
          outlineWidth: defaults.sizes.pointOutlineWidth,
        },
        ...points,
        {
          id: `${POINT_QUERY_PREVIEW_LAYER_ID}-point-vertical`,
          coordinate: adjacentVerticalCorner,
          pixelSize: defaults.sizes.previewPointPixelSize,
          fill: defaults.colors.preview,
          outline: defaults.colors.surface,
          outlineWidth: defaults.sizes.pointOutlineWidth,
        },
      ],
      edges: [
        {
          id: `${POINT_QUERY_PREVIEW_LAYER_ID}-edge-vertical-area`,
          coordinates: [
            firstCorner,
            adjacentHorizontalCorner,
            hoverCoordinate,
            adjacentVerticalCorner,
            firstCorner,
          ],
          stroke: defaults.colors.preview,
          strokeWidth: defaults.sizes.edgeStrokeWidth,
          dashed: true,
        },
      ],
      pointLabels: [],
    };
  }

  const activeDraftTailCoordinate =
    activeDraftCoordinates[activeDraftCoordinates.length - 1] ?? null;
  const edges = activeDraftTailCoordinate
    ? [
        {
          id: `${POINT_QUERY_PREVIEW_LAYER_ID}-edge`,
          coordinates: [activeDraftTailCoordinate, hoverCoordinate],
          stroke: defaults.colors.preview,
          strokeWidth: defaults.sizes.edgeStrokeWidth,
          dashed: true,
        },
      ]
    : [];

  return {
    points,
    edges,
    pointLabels: [],
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
  addAnnotation,
  setRenderLayer,
  clearRenderLayer,
  setCursorScreenPosition,
  bindApi,
  activeMoveGizmoNodeId,
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  setActiveToolTypeInStore: (toolType: RuntimeToolId) => void;
  addAnnotation: (
    toolType: RuntimeMeasurement["toolType"],
    coordinates: readonly RuntimeCoordinate[],
    options?: RuntimeAddAnnotationOptions
  ) => RuntimeMeasurement;
  setRenderLayer: (layerId: string, layer: RuntimeRenderLayer) => void;
  clearRenderLayer: (layerId: string) => void;
  setCursorScreenPosition: (
    cursorScreenPosition: RuntimeCursorScreenPosition
  ) => void;
  bindApi: (api: RuntimeLifecycleHostApi) => void;
  activeMoveGizmoNodeId: string | null;
}) => {
  const activeToolType = useAnnotationsSelector(
    (state) => state.annotationToolType
  );
  const state = useSyncExternalStore(
    annotationsStore.subscribe,
    annotationsStore.getState,
    annotationsStore.getState
  );
  const nodes = useAnnotationsSelector((annotationsState) => annotationsState.nodes);
  const [hoverCoordinate, setHoverCoordinate] =
    useState<RuntimeCoordinate | null>(null);
  const [hoverScreenPosition, setHoverScreenPosition] =
    useState<RuntimeCursorScreenPosition>(null);

  const sessionContext = useMemo(
    () => ({
      state,
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
      state,
    ]
  );
  const toolSessions = useToolSessions(registry, sessionContext);
  const activePlugin = registry.getPlugin(activeToolType) ?? null;

  useEffect(() => {
    annotationsStore.dispatch(
      setSelectionModeActive(activePlugin?.kind === "interaction")
    );
  }, [activePlugin?.kind, annotationsStore]);

  const previousPointTemporaryModeRef = useRef(
    state.settingsState.pointTemporaryMode
  );
  useEffect(() => {
    const previousPointTemporaryMode = previousPointTemporaryModeRef.current;
    const currentPointTemporaryMode = state.settingsState.pointTemporaryMode;
    if (previousPointTemporaryMode && !currentPointTemporaryMode) {
      annotationsStore.dispatch(
        finalizeTemporaryAnnotationsByToolType(POINT_TOOL_ID)
      );
    }
    previousPointTemporaryModeRef.current = currentPointTemporaryMode;
  }, [annotationsStore, state.settingsState.pointTemporaryMode]);

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
  } =
    usePointQueryToolRouting({
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
    (activeToolSession?.onNodeCreated || activePlugin?.pointQuery?.onPointCreated) &&
      !activeMoveGizmoNodeId
  );

  useSceneCoordinateHandler({
    scene,
    enabled: pointQueryEnabled,
    onCoordinate: handlePointQueryPointCreated,
    onDoubleCoordinate: activeToolSession?.finishesOnLoopClosure
      ? () => {
          requestFinishMeasurement();
        }
      : undefined,
    onScreenPositionChange: (screenPosition) => {
      setHoverScreenPosition(screenPosition);
      setCursorScreenPosition(pointQueryEnabled ? screenPosition : null);
    },
    onHoverCoordinateChange: (coordinate, screenPosition) => {
      setHoverCoordinate(
        pointQueryEnabled && coordinate
          ? resolvePointQueryCoordinate(coordinate, screenPosition)
          : null
      );
    },
  });

  useEffect(() => {
    if (pointQueryEnabled) {
      return;
    }

    setCursorScreenPosition(null);
    setHoverCoordinate(null);
    setHoverScreenPosition(null);
  }, [pointQueryEnabled, setCursorScreenPosition]);

  usePointPreviewRingIndicator(
    scene,
    {
      coordinate: hoverCoordinate,
      screenPosition: hoverScreenPosition,
    },
    {
      radius: POINT_QUERY_DISC_RADIUS_METERS,
      enabled: pointQueryEnabled && Boolean(hoverCoordinate),
    }
  );

  useEffect(() => {
    const previewLayer = buildPointQueryPreviewRenderLayer({
      activeToolType,
      state,
      pointQueryEnabled,
      hoverCoordinate,
    });

    if (!previewLayer) {
      clearRenderLayer(POINT_QUERY_PREVIEW_LAYER_ID);
      return;
    }

    setRenderLayer(POINT_QUERY_PREVIEW_LAYER_ID, previewLayer);
  }, [
    activeToolType,
    clearRenderLayer,
    hoverCoordinate,
    pointQueryEnabled,
    setRenderLayer,
    state,
  ]);

  useEffect(
    () => () => {
      clearRenderLayer(POINT_QUERY_PREVIEW_LAYER_ID);
    },
    [clearRenderLayer]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !event.defaultPrevented &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !isEditableKeyboardTarget(event.target) &&
        (event.key === "Delete" || event.key === "Backspace")
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

      if (event.key === "Escape" && activeToolSession) {
        activeToolSession?.discardDraft();
        event.preventDefault();
        return;
      }

      if (event.key === "Enter" && requestFinishMeasurement()) {
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
    requestFinishMeasurement,
    requestModeChange,
    requestStartMeasurement,
    sessionContext,
  ]);

  return null;
};

const RuntimeVisualizationHost = ({
  scene,
  registry,
  annotationsStore,
  setSelectedAnnotationId,
  onActiveMoveGizmoNodeIdChange,
  bindApi,
}: {
  scene: RuntimeScene | null;
  registry: AnnotationToolRegistry;
  annotationsStore: AnnotationsStore;
  setSelectedAnnotationId: (annotationId: string | null) => void;
  onActiveMoveGizmoNodeIdChange: (nodeId: string | null) => void;
  bindApi: (api: RuntimeRenderHostApi) => void;
}) => {
  useOverlayPositionSync(scene);

  const state = useSyncExternalStore(
    annotationsStore.subscribe,
    annotationsStore.getState,
    annotationsStore.getState
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
  const [renderState, setRenderState] = useState<RuntimeRenderHostState>({
    renderLayers: {},
    cursorScreenPosition: null,
  });
  const { handleNodeLongPress } = usePointEditingGizmo({
    scene,
    nodes,
    annotationsStore,
    setSelectedAnnotationId,
    onActiveMoveGizmoNodeIdChange,
  });

  const setRenderLayer = useCallback(
    (layerId: string, layer: RuntimeRenderLayer) => {
      setRenderState((previousState) => {
        if (
          areRuntimeRenderLayersEqual(
            previousState.renderLayers[layerId],
            layer
          )
        ) {
          return previousState;
        }

        return {
          ...previousState,
          renderLayers: {
            ...previousState.renderLayers,
            [layerId]: layer,
          },
        };
      });
    },
    []
  );

  const clearRenderLayer = useCallback((layerId: string) => {
    setRenderState((previousState) => {
      if (!(layerId in previousState.renderLayers)) {
        return previousState;
      }

      const nextRenderLayers = { ...previousState.renderLayers };
      delete nextRenderLayers[layerId];

      return {
        ...previousState,
        renderLayers: nextRenderLayers,
      };
    });
  }, []);

  const setCursorScreenPosition = useCallback(
    (cursorScreenPosition: RuntimeCursorScreenPosition) => {
      setRenderState((previousState) =>
        areRuntimeCursorScreenPositionsEqual(
          previousState.cursorScreenPosition,
          cursorScreenPosition
        )
          ? previousState
          : {
              ...previousState,
              cursorScreenPosition,
            }
      );
    },
    []
  );

  useEffect(() => {
    bindApi({
      setRenderLayer,
      clearRenderLayer,
      setCursorScreenPosition,
    });

    return () => {
      bindApi(NOOP_RUNTIME_RENDER_HOST_API);
    };
  }, [bindApi, clearRenderLayer, setCursorScreenPosition, setRenderLayer]);

  const aggregatedRenderLayer = useMemo(() => {
    const pluginLayers = registry.plugins
      .map(
        (plugin) =>
          plugin.renderLayer?.build({
            state,
            nodes,
            edges,
            annotationEntries,
            selectedAnnotationId,
            setSelectedAnnotationId,
            onNodeLongPress: handleNodeLongPress,
          }) ?? null
      )
      .filter((layer): layer is RuntimeRenderLayer => Boolean(layer));
    const runtimeLayers = Object.values(renderState.renderLayers);
    const allLayers = [...pluginLayers, ...runtimeLayers];

    return {
      points: allLayers.flatMap((layer) => layer.points ?? []),
      edges: allLayers.flatMap((layer) => layer.edges ?? []),
      pointLabels: allLayers.flatMap((layer) => layer.pointLabels ?? []),
    };
  }, [
    annotationEntries,
    edges,
    nodes,
    registry.plugins,
    renderState.renderLayers,
    selectedAnnotationId,
    setSelectedAnnotationId,
    handleNodeLongPress,
    state,
  ]);

  const normalizedPointLabels = useMemo(
    () =>
      aggregatedRenderLayer.pointLabels.map((pointLabel) => ({
        ...pointLabel,
        onLongPress:
          pointLabel.onLongPress ??
          (pointLabel.nodeId && pointLabel.measurementId
            ? () =>
                handleNodeLongPress(
                  pointLabel.nodeId,
                  pointLabel.measurementId
                )
            : undefined),
        longPressDurationMs:
          pointLabel.longPressDurationMs ?? NODE_LABEL_LONG_PRESS_DURATION_MS,
      })),
    [aggregatedRenderLayer.pointLabels, handleNodeLongPress]
  );

  useCursorOverlay(renderState.cursorScreenPosition, {
    enabled: renderState.cursorScreenPosition !== null,
  });

  return (
    <>
      <MeasurementPrimitivesVisualizer
        scene={scene}
        points={aggregatedRenderLayer.points ?? []}
        edges={aggregatedRenderLayer.edges ?? []}
      />
      <RuntimePointLabelVisualizer
        scene={scene}
        labels={normalizedPointLabels}
        blockLabelInteractions={renderState.cursorScreenPosition !== null}
      />
    </>
  );
};

export const AnnotationsProvider = ({
  scene,
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
  const renderHostApiRef = useRef<RuntimeRenderHostApi>(
    NOOP_RUNTIME_RENDER_HOST_API
  );
  const lifecycleHostApiRef = useRef<RuntimeLifecycleHostApi>(
    NOOP_RUNTIME_LIFECYCLE_HOST_API
  );
  const measurementSequenceRef = useRef(0);
  const nodeSequenceRef = useRef(0);
  const edgeSequenceRef = useRef(0);
  const [activeMoveGizmoNodeId, setActiveMoveGizmoNodeId] = useState<string | null>(
    null
  );

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

  const setPointTemporaryModeInStore = useCallback(
    (temporaryMode: boolean) => {
      annotationsStore.dispatch(setPointTemporaryModeInStoreAction(temporaryMode));
    },
    [annotationsStore]
  );

  const bindRenderHostApi = useCallback((api: RuntimeRenderHostApi) => {
    renderHostApiRef.current = api;
  }, []);

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
      setPointTemporaryMode: setPointTemporaryModeInStore,
      setSelectedAnnotationId: setSelectedAnnotationIdInStore,
      setRenderLayer: (layerId, layer) =>
        renderHostApiRef.current.setRenderLayer(layerId, layer),
      clearRenderLayer: (layerId) =>
        renderHostApiRef.current.clearRenderLayer(layerId),
      setCursorScreenPosition: (cursorScreenPosition) =>
        renderHostApiRef.current.setCursorScreenPosition(cursorScreenPosition),
    }),
    [
      addAnnotation,
      annotationsStore,
      registry,
      scene,
      setActiveToolType,
      setPointTemporaryModeInStore,
      setSelectedAnnotationIdInStore,
    ]
  );

  return (
    <ReduxProvider store={annotationsStore}>
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
          addAnnotation={addAnnotation}
          setRenderLayer={(layerId, layer) =>
            renderHostApiRef.current.setRenderLayer(layerId, layer)
          }
          clearRenderLayer={(layerId) =>
            renderHostApiRef.current.clearRenderLayer(layerId)
          }
          setCursorScreenPosition={(cursorScreenPosition) =>
            renderHostApiRef.current.setCursorScreenPosition(
              cursorScreenPosition
            )
          }
          activeMoveGizmoNodeId={activeMoveGizmoNodeId}
          bindApi={bindLifecycleHostApi}
        />
        <RuntimeVisualizationHost
          scene={scene}
          registry={registry}
          annotationsStore={annotationsStore}
          setSelectedAnnotationId={setSelectedAnnotationIdInStore}
          onActiveMoveGizmoNodeIdChange={setActiveMoveGizmoNodeId}
          bindApi={bindRenderHostApi}
        />
        {children}
      </AnnotationsRuntimeContext.Provider>
    </ReduxProvider>
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
    setPointTemporaryMode,
    setSelectedAnnotationId,
    setRenderLayer,
    clearRenderLayer,
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
    pointTemporaryMode,
    setPointTemporaryMode,
    nodes,
    edges,
    annotationEntries,
    selectedAnnotationId,
    setSelectedAnnotationId,
    addAnnotation,
    setRenderLayer,
    clearRenderLayer,
    setCursorScreenPosition,
  };
};

export const useRuntimeRenderLayer = (
  layerId: string,
  layer: RuntimeRenderLayer
) => {
  const { setRenderLayer, clearRenderLayer } =
    useRequiredAnnotationsRuntimeServices();

  useEffect(() => {
    setRenderLayer(layerId, layer);
  }, [clearRenderLayer, layer, layerId, setRenderLayer]);

  useEffect(
    () => () => {
      clearRenderLayer(layerId);
    },
    [clearRenderLayer, layerId]
  );
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
