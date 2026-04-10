import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Radio } from "antd";
import L from "leaflet";
import maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

import { WUPPERTAL } from "@carma-commons/resources";
import {
  FROSTED_GLASS_BLUR_PRESET,
  ResponsiveStatusBar,
  readFrostedGlassBackdropStyle,
  readFrostedGlassShadowStyle,
} from "@carma-commons/ui/components";
import {
  transitionToCesium,
  transitionToLeaflet,
} from "@carma-mapping/engines-interop/leaflet-cesium";
import {
  useViewState,
  useViewStateControllerId,
  useCesiumRuntimeBridge,
  useMaplibreRuntimeBridge,
  useLeafletRuntimeBridge,
  type ViewState,
} from "@carma-mapping/engines-interop/view-state";
import { type CesiumWidget } from "@carma-cesium";

import {
  initializeCesium,
  initializeTerrainProviders,
  loadTileset,
} from "../../map-engine-switcher/helpers/cesium-setup";
import { initializeLeaflet } from "../../map-engine-switcher/helpers/leaflet-setup";
import {
  bindStoryCesiumFrameListener,
  readStoryCesiumScene,
  requestStoryCesiumRender,
} from "../../shared/cesiumRuntimeGuards";
import { ViewSyncRuntimeNavigationControls } from "./controls/view-sync-runtime-navigation-controls";
import {
  CARMA_STORY_MAPPING_ENGINES,
  STORY_MAPPING_ENGINE_OPTIONS,
  type StoryMappingEngine,
} from "./mappingEngines";
import {
  useContainerResize,
  useDeferredBootReady,
  useElementWidth,
} from "./viewSyncStoryHooks";
import {
  GEO_PORTAL_MAPLIBRE_STYLE,
  INITIAL_SLOT_BOOT_DELAY_STEP_MS,
  LEAFLET_TO_CESIUM_TRANSITION_OPTIONS,
  META_VISUAL_HEIGHT_PX,
  META_VISUAL_WIDTH_PX,
  PANEL_MIN_WIDTH_PX,
  addButtonStyle,
  applyViewStateToCesiumWidget,
  buildLeafletViewFromState,
  buildMapLibreCameraOptionsFromState,
  isLeafletCesiumTransition,
  isViewState,
  overlayLayerStyle,
  panelSlotStyle,
  panelsRowStyle,
  readCesiumTransitionTargetCameraState,
  type CesiumRuntimeHandle,
  type LeafletRuntimeHandle,
  type MapLibreRuntimeHandle,
  type SlotConfig,
  type SlotMountConfig,
  type SlotRuntimeHandle,
  type SlotTransitionRequest,
  type SlotViewSyncHandle,
} from "./viewSyncStoryShared";
import {
  buildPanelStatusText,
  DEFAULT_STATUS_BAR_DELIMITER,
  formatMappingEngineStatusFromViewState,
  ViewSyncMetaOverlay,
} from "./ViewSyncStoryUi";
const MappingEnginePanel = ({
  slot,
  activeRuntimeEngine,
  isController,
  canDelete,
  isEngineTransitioning,
  disableEngineSelection,
  onEngineChange,
  onDelete,
  statusText,
  children,
}: {
  slot: SlotConfig;
  activeRuntimeEngine: StoryMappingEngine;
  isController: boolean;
  canDelete: boolean;
  isEngineTransitioning: boolean;
  disableEngineSelection: boolean;
  onEngineChange: (engine: StoryMappingEngine) => void;
  onDelete: () => void;
  statusText: string;
  children: ReactNode;
}) => {
  return (
    <section
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        borderRadius: 0,
        overflow: "hidden",
        border: "none",
        boxShadow: "none",
        background: "#0f172a",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: "rgba(15, 23, 42, 0.94)",
          borderBottom: "none",
        }}
      >
        <Radio.Group
          value={slot.engine}
          optionType="button"
          buttonStyle="solid"
          size="small"
          disabled={disableEngineSelection || isEngineTransitioning}
          onChange={(event) =>
            onEngineChange(event.target.value as StoryMappingEngine)
          }
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          style={{
            display: "flex",
            flex: 1,
            minWidth: 0,
          }}
        >
          {STORY_MAPPING_ENGINE_OPTIONS.map((engine) => (
            <Radio.Button
              key={engine}
              value={engine}
              style={{
                flex: 1,
                textAlign: "center",
                fontWeight:
                  engine === activeRuntimeEngine && engine !== slot.engine
                    ? 700
                    : 500,
              }}
            >
              {engine}
            </Radio.Button>
          ))}
        </Radio.Group>

        <Button
          danger
          ghost
          size="small"
          icon={<DeleteOutlined />}
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={!canDelete}
          style={{
            width: 32,
            minWidth: 32,
            paddingInline: 0,
          }}
        />
      </header>

      <div
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          background: "#cbd5e1",
          overflow: "hidden",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 20,
          }}
        >
          <ResponsiveStatusBar
            text={buildPanelStatusText(
              statusText,
              DEFAULT_STATUS_BAR_DELIMITER
            )}
            tone={isController ? "light" : "dark"}
          />
        </div>
      </div>
    </section>
  );
};

const CesiumViewSyncBridge = ({
  slotId,
  widget,
  setStatusText,
  onViewSyncHandleChange,
  onObservedStateChange,
}: {
  slotId: string;
  widget: CesiumWidget;
  setStatusText: (value: string) => void;
  onViewSyncHandleChange?: (handle: SlotViewSyncHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
}) => {
  const { claimControl, releaseControl, pushState, readCurrentState } =
    useCesiumRuntimeBridge({
      id: slotId,
      scene: widget.scene,
      claimBeforePush: false,
      claimOnInteraction: true,
    });
  const viewSyncHandleChangeRef = useRef(onViewSyncHandleChange);
  const observedStateChangeRef = useRef(onObservedStateChange);

  viewSyncHandleChangeRef.current = onViewSyncHandleChange;
  observedStateChangeRef.current = onObservedStateChange;

  useEffect(() => {
    viewSyncHandleChangeRef.current?.({
      claimControl,
      releaseControl,
      pushState,
    });
    return () => {
      viewSyncHandleChangeRef.current?.(null);
    };
  }, [claimControl, pushState, releaseControl]);

  useEffect(() => {
    const scene = readStoryCesiumScene(widget);
    if (!scene) {
      return;
    }

    const handler = () => {
      const state = readCurrentState();
      observedStateChangeRef.current?.(state);
      if (!state) {
        setStatusText(
          `${CARMA_STORY_MAPPING_ENGINES.CESIUM}${DEFAULT_STATUS_BAR_DELIMITER}waiting for terrain target`
        );
        return;
      }

      setStatusText(
        formatMappingEngineStatusFromViewState(
          CARMA_STORY_MAPPING_ENGINES.CESIUM,
          state,
          { delimiter: DEFAULT_STATUS_BAR_DELIMITER }
        )
      );
    };

    const removeListener = bindStoryCesiumFrameListener(scene, handler);
    handler();
    return () => {
      observedStateChangeRef.current?.(null);
      removeListener?.();
    };
  }, [readCurrentState, setStatusText, widget]);

  return null;
};

const CesiumSlot = ({
  slotId,
  setStatusText,
  initialTarget,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  onObservedStateChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  initialTarget?: ViewState | null;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: CesiumRuntimeHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [widget, setWidget] = useState<CesiumWidget | null>(null);
  const [viewSyncHandle, setViewSyncHandle] =
    useState<SlotViewSyncHandle | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const terrainProvidersRef = useRef<Awaited<
    ReturnType<typeof initializeTerrainProviders>
  > | null>(null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    let cancelled = false;
    let nextWidget: CesiumWidget | null = null;
    let initialApplyFrameId: number | null = null;

    (async () => {
      nextWidget = initializeCesium(container, {
        useBrowserRecommendedResolution: true,
      });

      if (initialTargetRef.current) {
        initialApplyFrameId = window.requestAnimationFrame(() => {
          if (!nextWidget || cancelled) {
            return;
          }

          applyViewStateToCesiumWidget({
            widget: nextWidget,
            state: initialTargetRef.current as ViewState,
          });
        });
      }

      const terrainProviders = await initializeTerrainProviders();
      if (cancelled || !nextWidget || nextWidget.isDestroyed()) {
        return;
      }

      terrainProvidersRef.current = terrainProviders;

      const nextScene = readStoryCesiumScene(nextWidget);
      if (terrainProviders.TERRAIN && nextScene) {
        nextScene.terrainProvider = terrainProviders.TERRAIN;
        requestStoryCesiumRender(nextScene);
      }

      await loadTileset(nextWidget);
      if (cancelled || !nextWidget || nextWidget.isDestroyed()) {
        return;
      }
      setWidget(nextWidget);
      requestStoryCesiumRender(nextWidget);
    })();

    return () => {
      cancelled = true;
      if (initialApplyFrameId !== null) {
        window.cancelAnimationFrame(initialApplyFrameId);
      }
      onReadyChangeRef.current?.(null);
      terrainProvidersRef.current = null;
      if (nextWidget && !nextWidget.isDestroyed()) {
        nextWidget.destroy();
      }
      setWidget(null);
    };
  }, [isBootReady]);

  useEffect(() => {
    const container = containerRef.current;
    const terrainProviders = terrainProvidersRef.current;
    if (!widget || widget.isDestroyed() || !container || !terrainProviders) {
      return;
    }

    onReadyChangeRef.current?.({
      engine: CARMA_STORY_MAPPING_ENGINES.CESIUM,
      widget,
      container,
      terrainProviders,
      viewSync: viewSyncHandle,
    });
  }, [viewSyncHandle, widget]);

  useContainerResize(containerRef, () => {
    if (!widget || widget.isDestroyed()) {
      return;
    }

    widget.resize();
    requestStoryCesiumRender(widget);
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {widget && registerWithViewSync ? (
        <CesiumViewSyncBridge
          slotId={slotId}
          widget={widget}
          setStatusText={reportStatus ? setStatusText : () => {}}
          onViewSyncHandleChange={setViewSyncHandle}
          onObservedStateChange={onObservedStateChange}
        />
      ) : null}
    </>
  );
};

const MapLibreViewSyncBridge = ({
  slotId,
  map,
  fallbackSeedState,
  setStatusText,
  onViewSyncHandleChange,
  onObservedStateChange,
}: {
  slotId: string;
  map: MapLibreMap;
  fallbackSeedState?: ViewState | null;
  setStatusText: (value: string) => void;
  onViewSyncHandleChange?: (handle: SlotViewSyncHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
}) => {
  const { claimControl, releaseControl, pushState, readCurrentState } =
    useMaplibreRuntimeBridge({
      id: slotId,
      map,
      fallbackSeedState,
      claimBeforePush: false,
      claimOnInteraction: true,
    });
  const viewSyncHandleChangeRef = useRef(onViewSyncHandleChange);
  const observedStateChangeRef = useRef(onObservedStateChange);

  viewSyncHandleChangeRef.current = onViewSyncHandleChange;
  observedStateChangeRef.current = onObservedStateChange;

  useEffect(() => {
    viewSyncHandleChangeRef.current?.({
      claimControl,
      releaseControl,
      pushState,
    });
    return () => {
      viewSyncHandleChangeRef.current?.(null);
    };
  }, [claimControl, pushState, releaseControl]);

  useEffect(() => {
    const updateStatus = () => {
      const state = readCurrentState();
      observedStateChangeRef.current?.(state);
      setStatusText(
        formatMappingEngineStatusFromViewState(
          CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL,
          state,
          { delimiter: DEFAULT_STATUS_BAR_DELIMITER }
        )
      );
    };

    map.on("load", updateStatus);
    map.on("move", updateStatus);
    map.on("rotate", updateStatus);
    map.on("pitch", updateStatus);
    map.on("resize", updateStatus);

    return () => {
      observedStateChangeRef.current?.(null);
      map.off("load", updateStatus);
      map.off("move", updateStatus);
      map.off("rotate", updateStatus);
      map.off("pitch", updateStatus);
      map.off("resize", updateStatus);
    };
  }, [map, readCurrentState, setStatusText]);

  return null;
};

const MapLibreSlot = ({
  slotId,
  setStatusText,
  initialTarget,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  onObservedStateChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  initialTarget?: ViewState | null;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: MapLibreRuntimeHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [viewSyncHandle, setViewSyncHandle] =
    useState<SlotViewSyncHandle | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialCameraOptions = isViewState(initialTargetRef.current)
      ? buildMapLibreCameraOptionsFromState(
          initialTargetRef.current,
          container.clientWidth,
          container.clientHeight
        )
      : null;

    const map = new maplibregl.Map({
      container,
      style: GEO_PORTAL_MAPLIBRE_STYLE as StyleSpecification,
      center: initialCameraOptions
        ? initialCameraOptions.center
        : [WUPPERTAL.position.longitude, WUPPERTAL.position.latitude],
      zoom: initialCameraOptions?.zoom ?? 16.5,
      bearing: initialCameraOptions?.bearing ?? 0,
      pitch: initialCameraOptions?.pitch ?? 0,
      attributionControl: false,
      hash: false,
    });
    setMap(map);

    return () => {
      onReadyChangeRef.current?.(null);
      map.remove();
      setMap(null);
    };
  }, [isBootReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!map || !container) {
      return;
    }

    onReadyChangeRef.current?.({
      engine: CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL,
      map,
      container,
      viewSync: viewSyncHandle,
    });
  }, [map, viewSyncHandle]);

  useContainerResize(containerRef, () => {
    if (!map) {
      return;
    }

    map.resize();
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {map && registerWithViewSync ? (
        <MapLibreViewSyncBridge
          slotId={slotId}
          map={map}
          fallbackSeedState={initialTargetRef.current}
          setStatusText={reportStatus ? setStatusText : () => {}}
          onViewSyncHandleChange={setViewSyncHandle}
          onObservedStateChange={onObservedStateChange}
        />
      ) : null}
    </>
  );
};

const LeafletViewSyncBridge = ({
  slotId,
  map,
  setStatusText,
  onViewSyncHandleChange,
  onObservedStateChange,
}: {
  slotId: string;
  map: L.Map;
  setStatusText: (value: string) => void;
  onViewSyncHandleChange?: (handle: SlotViewSyncHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
}) => {
  const { claimControl, releaseControl, pushState, readCurrentState } =
    useLeafletRuntimeBridge({
      id: slotId,
      map,
      claimBeforePush: false,
      claimOnInteraction: true,
    });
  const viewSyncHandleChangeRef = useRef(onViewSyncHandleChange);
  const observedStateChangeRef = useRef(onObservedStateChange);

  viewSyncHandleChangeRef.current = onViewSyncHandleChange;
  observedStateChangeRef.current = onObservedStateChange;

  useEffect(() => {
    viewSyncHandleChangeRef.current?.({
      claimControl,
      releaseControl,
      pushState,
    });
    return () => {
      viewSyncHandleChangeRef.current?.(null);
    };
  }, [claimControl, pushState, releaseControl]);

  useEffect(() => {
    const updateStatus = () => {
      const state = readCurrentState();
      observedStateChangeRef.current?.(state);
      setStatusText(
        formatMappingEngineStatusFromViewState(
          CARMA_STORY_MAPPING_ENGINES.LEAFLET,
          state,
          { delimiter: DEFAULT_STATUS_BAR_DELIMITER }
        )
      );
    };

    map.on("move", updateStatus);
    map.on("zoom", updateStatus);
    map.whenReady(updateStatus);

    return () => {
      observedStateChangeRef.current?.(null);
      map.off("move", updateStatus);
      map.off("zoom", updateStatus);
    };
  }, [map, readCurrentState, setStatusText]);

  return null;
};

const LeafletSlot = ({
  slotId,
  setStatusText,
  initialTarget,
  allowFractionalZoom = false,
  registerWithViewSync = true,
  reportStatus = true,
  onReadyChange,
  onObservedStateChange,
  containerStyle,
  bootDelayMs = 0,
}: {
  slotId: string;
  setStatusText: (value: string) => void;
  initialTarget?: ViewState | null;
  allowFractionalZoom?: boolean;
  registerWithViewSync?: boolean;
  reportStatus?: boolean;
  onReadyChange?: (handle: LeafletRuntimeHandle | null) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
  containerStyle?: CSSProperties;
  bootDelayMs?: number;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const [viewSyncHandle, setViewSyncHandle] =
    useState<SlotViewSyncHandle | null>(null);
  const initialTargetRef = useRef(initialTarget ?? null);
  const onReadyChangeRef = useRef(onReadyChange);
  const isBootReady = useDeferredBootReady(true, bootDelayMs);

  if (!initialTargetRef.current && initialTarget) {
    initialTargetRef.current = initialTarget;
  }

  useEffect(() => {
    onReadyChangeRef.current = onReadyChange;
  }, [onReadyChange]);

  useEffect(() => {
    if (!isBootReady) {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const nextMap = initializeLeaflet(container, {
      allowFractionalZoom,
    });
    const initialView = isViewState(initialTargetRef.current)
      ? buildLeafletViewFromState(
          initialTargetRef.current,
          container.clientWidth,
          container.clientHeight
        )
      : null;
    if (initialView) {
      nextMap.setView(
        initialView.center,
        initialView.zoom,
        undefined as L.ZoomPanOptions
      );
    }
    setMap(nextMap);

    return () => {
      onReadyChangeRef.current?.(null);
      nextMap.remove();
      setMap(null);
    };
  }, [allowFractionalZoom, isBootReady]);

  useEffect(() => {
    const container = containerRef.current;
    if (!map || !container) {
      return;
    }

    onReadyChangeRef.current?.({
      engine: CARMA_STORY_MAPPING_ENGINES.LEAFLET,
      map,
      container,
      viewSync: viewSyncHandle,
    });
  }, [map, viewSyncHandle]);

  useContainerResize(containerRef, () => {
    if (!map) {
      return;
    }

    map.invalidateSize(false);
  });

  return (
    <>
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          ...containerStyle,
        }}
      />
      {map && registerWithViewSync ? (
        <LeafletViewSyncBridge
          slotId={slotId}
          map={map}
          setStatusText={reportStatus ? setStatusText : () => {}}
          onViewSyncHandleChange={setViewSyncHandle}
          onObservedStateChange={onObservedStateChange}
        />
      ) : null}
    </>
  );
};

const SlotMountRenderer = ({
  slotId,
  mount,
  initialTarget,
  allowLeafletFractionalZoom = false,
  setStatusText,
  onRuntimeHandleChange,
  onObservedStateChange,
  bootDelayMs = 0,
}: {
  slotId: string;
  mount: SlotMountConfig;
  initialTarget: ViewState | null;
  allowLeafletFractionalZoom?: boolean;
  setStatusText: (value: string) => void;
  onRuntimeHandleChange: (
    mountId: string,
    handle: SlotRuntimeHandle | null
  ) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
  bootDelayMs?: number;
}) => {
  const containerStyle: CSSProperties =
    mount.layer === "overlay"
      ? {
          zIndex: 6,
          opacity: 0,
          pointerEvents: "none",
        }
      : mount.layer === "underlay"
      ? {
          zIndex: 1,
        }
      : {
          zIndex: 3,
        };

  if (!initialTarget) {
    return null;
  }

  if (mount.engine === CARMA_STORY_MAPPING_ENGINES.CESIUM) {
    return (
      <CesiumSlot
        slotId={slotId}
        setStatusText={setStatusText}
        initialTarget={initialTarget}
        registerWithViewSync={mount.registerWithViewSync}
        reportStatus={mount.reportStatus}
        onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
        onObservedStateChange={onObservedStateChange}
        containerStyle={containerStyle}
        bootDelayMs={bootDelayMs}
      />
    );
  }

  if (mount.engine === CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL) {
    return (
      <MapLibreSlot
        slotId={slotId}
        setStatusText={setStatusText}
        initialTarget={initialTarget}
        registerWithViewSync={mount.registerWithViewSync}
        reportStatus={mount.reportStatus}
        onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
        onObservedStateChange={onObservedStateChange}
        containerStyle={containerStyle}
        bootDelayMs={bootDelayMs}
      />
    );
  }

  return (
    <LeafletSlot
      slotId={slotId}
      setStatusText={setStatusText}
      initialTarget={initialTarget}
      allowFractionalZoom={allowLeafletFractionalZoom}
      registerWithViewSync={mount.registerWithViewSync}
      reportStatus={mount.reportStatus}
      onReadyChange={(handle) => onRuntimeHandleChange(mount.id, handle)}
      onObservedStateChange={onObservedStateChange}
      containerStyle={containerStyle}
      bootDelayMs={bootDelayMs}
    />
  );
};

const SlotPanelController = ({
  slot,
  fallbackTarget,
  allowLeafletFractionalZoom = false,
  shouldAutoClaimOnBoot,
  initialBootDelayMs = 0,
  isController,
  disableEngineSelection,
  canDelete,
  onEngineChange,
  onDelete,
  onTransitioningChange,
  onObservedStateChange,
  onActiveRuntimeChange,
}: {
  slot: SlotConfig;
  fallbackTarget: ViewState;
  allowLeafletFractionalZoom?: boolean;
  shouldAutoClaimOnBoot: boolean;
  initialBootDelayMs?: number;
  isController: boolean;
  disableEngineSelection: boolean;
  canDelete: boolean;
  onEngineChange: (engine: StoryMappingEngine) => void;
  onDelete: () => void;
  onTransitioningChange: (slotId: string, isTransitioning: boolean) => void;
  onObservedStateChange?: (state: ViewState | null) => void;
  onActiveRuntimeChange?: (isActive: boolean) => void;
}) => {
  const controllerId = useViewStateControllerId();
  const currentState = useViewState();
  const providerTarget = currentState ?? fallbackTarget;
  const [statusText, setStatusText] = useState(
    `${slot.engine}${DEFAULT_STATUS_BAR_DELIMITER}booting`
  );
  const [mounts, setMounts] = useState<SlotMountConfig[]>([
    {
      id: `${slot.id}-mount-1`,
      engine: slot.engine,
      registerWithViewSync: true,
      reportStatus: true,
      layer: "base",
    },
  ]);
  const [transitionRequest, setTransitionRequest] =
    useState<SlotTransitionRequest | null>(null);
  const runtimeHandlesRef = useRef<Record<string, SlotRuntimeHandle | null>>(
    {}
  );
  const lastCesiumCameraStateRef =
    useRef<ReturnType<typeof readCesiumTransitionTargetCameraState>>(null);
  const [runtimeHandleVersion, setRuntimeHandleVersion] = useState(0);
  const transitionRunRef = useRef<string | null>(null);
  const nextMountIndexRef = useRef(2);
  const initialControllerAssignedRef = useRef(false);
  const [initialBootDelayConsumed, setInitialBootDelayConsumed] = useState(
    initialBootDelayMs <= 0
  );
  const activeRuntimeEngine =
    mounts.find((mount) => mount.registerWithViewSync)?.engine ?? slot.engine;
  const isEngineTransitioning = transitionRequest !== null;
  const activeRuntimeChangeRef = useRef(onActiveRuntimeChange);

  activeRuntimeChangeRef.current = onActiveRuntimeChange;

  useEffect(() => {
    onTransitioningChange(slot.id, isEngineTransitioning);
  }, [isEngineTransitioning, onTransitioningChange, slot.id]);

  useEffect(() => {
    return () => {
      onTransitioningChange(slot.id, false);
    };
  }, [onTransitioningChange, slot.id]);

  useEffect(() => {
    setStatusText(`${slot.engine}${DEFAULT_STATUS_BAR_DELIMITER}booting`);
  }, [slot.engine]);

  useEffect(() => {
    if (isEngineTransitioning) {
      return;
    }

    setMounts((previousMounts) => {
      const activeMount = previousMounts.find(
        (mount) => mount.registerWithViewSync
      );
      if (
        previousMounts.length === 1 &&
        activeMount &&
        activeMount.engine === slot.engine
      ) {
        return previousMounts;
      }

      return [
        {
          id: activeMount?.id ?? `${slot.id}-mount-1`,
          engine: slot.engine,
          registerWithViewSync: true,
          reportStatus: true,
          layer: "base",
        },
      ];
    });
  }, [isEngineTransitioning, slot.engine, slot.id]);

  const handleRuntimeHandleChange = useCallback(
    (mountId: string, handle: SlotRuntimeHandle | null) => {
      runtimeHandlesRef.current[mountId] = handle;
      setRuntimeHandleVersion((version) => version + 1);
      if (handle && !initialBootDelayConsumed) {
        setInitialBootDelayConsumed(true);
      }
    },
    [initialBootDelayConsumed]
  );

  const getActiveRuntimeHandle = useCallback((): SlotRuntimeHandle | null => {
    const activeMount = mounts.find((mount) => mount.registerWithViewSync);
    if (!activeMount) {
      return null;
    }
    return runtimeHandlesRef.current[activeMount.id] ?? null;
  }, [mounts, runtimeHandleVersion]);

  const activeRuntimeHandle = getActiveRuntimeHandle();

  useEffect(() => {
    activeRuntimeChangeRef.current?.(Boolean(activeRuntimeHandle));
    return () => {
      activeRuntimeChangeRef.current?.(false);
    };
  }, [activeRuntimeHandle]);

  useEffect(() => {
    if (
      !shouldAutoClaimOnBoot ||
      initialControllerAssignedRef.current ||
      controllerId ||
      !activeRuntimeHandle?.viewSync
    ) {
      return;
    }

    let rafId: number | null = null;
    const tryInitialClaim = () => {
      if (initialControllerAssignedRef.current || controllerId) {
        return;
      }

      if (activeRuntimeHandle.viewSync?.claimControl("sync")) {
        initialControllerAssignedRef.current = true;
        return;
      }

      rafId = window.requestAnimationFrame(tryInitialClaim);
    };

    rafId = window.requestAnimationFrame(tryInitialClaim);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [activeRuntimeHandle, controllerId, shouldAutoClaimOnBoot]);

  const handleEngineSelection = useCallback(
    (nextEngine: StoryMappingEngine) => {
      if (nextEngine === slot.engine || isEngineTransitioning) {
        return;
      }

      const activeMount = mounts.find((mount) => mount.registerWithViewSync);
      if (!activeMount) {
        onEngineChange(nextEngine);
        return;
      }

      if (isLeafletCesiumTransition(activeMount.engine, nextEngine)) {
        const targetMountId = `${slot.id}-mount-${nextMountIndexRef.current++}`;
        const restoreControllerAfterTransition = controllerId === slot.id;

        if (restoreControllerAfterTransition) {
          activeRuntimeHandle?.viewSync?.releaseControl();
        }

        setMounts((previousMounts) => [
          ...previousMounts.map((mount) =>
            mount.id === activeMount.id
              ? {
                  ...mount,
                  registerWithViewSync: false,
                  reportStatus: false,
                  layer: "base",
                }
              : mount
          ),
          {
            id: targetMountId,
            engine: nextEngine,
            registerWithViewSync: false,
            reportStatus: false,
            layer:
              nextEngine === CARMA_STORY_MAPPING_ENGINES.CESIUM
                ? "overlay"
                : "underlay",
          },
        ]);
        setTransitionRequest({
          sourceMountId: activeMount.id,
          targetMountId,
          sourceEngine: activeMount.engine,
          targetEngine: nextEngine,
          restoreControllerAfterTransition,
        });
        onEngineChange(nextEngine);
        return;
      }

      setMounts([
        {
          id: `${slot.id}-mount-${nextMountIndexRef.current++}`,
          engine: nextEngine,
          registerWithViewSync: true,
          reportStatus: true,
          layer: "base",
        },
      ]);
      onEngineChange(nextEngine);
    },
    [
      isEngineTransitioning,
      mounts,
      onEngineChange,
      slot.engine,
      slot.id,
      activeRuntimeHandle,
      controllerId,
    ]
  );

  useEffect(() => {
    if (
      !transitionRequest ||
      transitionRunRef.current === transitionRequest.targetMountId
    ) {
      return;
    }

    const sourceHandle =
      runtimeHandlesRef.current[transitionRequest.sourceMountId];
    const targetHandle =
      runtimeHandlesRef.current[transitionRequest.targetMountId];
    if (!sourceHandle || !targetHandle) {
      return;
    }

    transitionRunRef.current = transitionRequest.targetMountId;

    const completeTransition = () => {
      setMounts((previousMounts) =>
        previousMounts
          .filter((mount) => mount.id !== transitionRequest.sourceMountId)
          .map((mount) =>
            mount.id === transitionRequest.targetMountId
              ? {
                  ...mount,
                  registerWithViewSync: true,
                  reportStatus: true,
                  layer: "base",
                }
              : mount
          )
      );
      delete runtimeHandlesRef.current[transitionRequest.sourceMountId];
      setTransitionRequest(null);
      transitionRunRef.current = null;

      if (transitionRequest.restoreControllerAfterTransition) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            targetHandle.viewSync?.claimControl("sync");
          });
        });
      }
    };

    const revertTransition = (message: string) => {
      setStatusText(message);
      setMounts((previousMounts) =>
        previousMounts
          .filter((mount) => mount.id !== transitionRequest.targetMountId)
          .map((mount) =>
            mount.id === transitionRequest.sourceMountId
              ? {
                  ...mount,
                  registerWithViewSync: true,
                  reportStatus: true,
                  layer: "base",
                }
              : mount
          )
      );
      delete runtimeHandlesRef.current[transitionRequest.targetMountId];
      onEngineChange(transitionRequest.sourceEngine);
      setTransitionRequest(null);
      transitionRunRef.current = null;
    };

    const runTransition = async () => {
      try {
        if (
          transitionRequest.sourceEngine ===
            CARMA_STORY_MAPPING_ENGINES.LEAFLET &&
          transitionRequest.targetEngine ===
            CARMA_STORY_MAPPING_ENGINES.CESIUM &&
          sourceHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET &&
          targetHandle.engine === CARMA_STORY_MAPPING_ENGINES.CESIUM
        ) {
          const targetCameraState =
            readCesiumTransitionTargetCameraState(providerTarget) ??
            lastCesiumCameraStateRef.current;

          await transitionToCesium(
            targetHandle.widget.scene,
            sourceHandle.map,
            targetHandle.container,
            targetHandle.terrainProviders,
            targetCameraState,
            {
              onStageChange: (_stage, message) =>
                setStatusText(
                  `leaflet -> cesium${DEFAULT_STATUS_BAR_DELIMITER}${message}`
                ),
              onComplete: completeTransition,
              onError: (error) =>
                revertTransition(
                  `leaflet -> cesium${DEFAULT_STATUS_BAR_DELIMITER}${error.message}`
                ),
            },
            LEAFLET_TO_CESIUM_TRANSITION_OPTIONS
          );
          return;
        }

        if (
          transitionRequest.sourceEngine ===
            CARMA_STORY_MAPPING_ENGINES.CESIUM &&
          transitionRequest.targetEngine ===
            CARMA_STORY_MAPPING_ENGINES.LEAFLET &&
          sourceHandle.engine === CARMA_STORY_MAPPING_ENGINES.CESIUM &&
          targetHandle.engine === CARMA_STORY_MAPPING_ENGINES.LEAFLET
        ) {
          const lastCameraState = await transitionToLeaflet(
            sourceHandle.widget.scene,
            targetHandle.map,
            sourceHandle.container,
            sourceHandle.terrainProviders,
            {
              onStageChange: (_stage, message) =>
                setStatusText(
                  `cesium -> leaflet${DEFAULT_STATUS_BAR_DELIMITER}${message}`
                ),
              onComplete: completeTransition,
              onError: (error) =>
                revertTransition(
                  `cesium -> leaflet${DEFAULT_STATUS_BAR_DELIMITER}${error.message}`
                ),
            }
          );
          lastCesiumCameraStateRef.current = lastCameraState ?? null;
          return;
        }

        revertTransition("mapping engine transition unsupported");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "transition failed";
        revertTransition(
          `${transitionRequest.sourceEngine} -> ${transitionRequest.targetEngine}${DEFAULT_STATUS_BAR_DELIMITER}${message}`
        );
      }
    };

    void runTransition();
  }, [onEngineChange, providerTarget, transitionRequest]);

  return (
    <MappingEnginePanel
      slot={slot}
      activeRuntimeEngine={activeRuntimeEngine}
      isController={isController}
      canDelete={canDelete}
      isEngineTransitioning={isEngineTransitioning}
      disableEngineSelection={disableEngineSelection}
      onEngineChange={handleEngineSelection}
      onDelete={onDelete}
      statusText={statusText}
    >
      <ViewSyncRuntimeNavigationControls
        controlId={slot.id}
        engine={activeRuntimeEngine}
        runtimeHandle={activeRuntimeHandle}
        homeTarget={fallbackTarget}
        disabled={isEngineTransitioning}
      />
      {mounts.map((mount) => (
        <SlotMountRenderer
          key={mount.id}
          slotId={slot.id}
          mount={mount}
          initialTarget={providerTarget}
          allowLeafletFractionalZoom={allowLeafletFractionalZoom}
          setStatusText={setStatusText}
          onRuntimeHandleChange={handleRuntimeHandleChange}
          onObservedStateChange={onObservedStateChange}
          bootDelayMs={
            !initialBootDelayConsumed &&
            !isEngineTransitioning &&
            mounts.length === 1 &&
            mount.layer === "base"
              ? initialBootDelayMs
              : 0
          }
        />
      ))}
    </MappingEnginePanel>
  );
};

export const SlotsLayout = ({
  fallbackTarget,
  allowLeafletFractionalZoom = false,
}: {
  fallbackTarget: ViewState;
  allowLeafletFractionalZoom?: boolean;
}) => {
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [slots, setSlots] = useState<SlotConfig[]>([
    { id: "slot-1", engine: CARMA_STORY_MAPPING_ENGINES.CESIUM },
    { id: "slot-2", engine: CARMA_STORY_MAPPING_ENGINES.MAPLIBRE_GL },
    { id: "slot-3", engine: CARMA_STORY_MAPPING_ENGINES.LEAFLET },
  ]);
  const nextSlotIndexRef = useRef(4);
  const controllerId = useViewStateControllerId();
  const [transitioningSlotIds, setTransitioningSlotIds] = useState<string[]>(
    []
  );
  const [slotObservedStates, setSlotObservedStates] = useState<
    Record<string, ViewState | null>
  >({});
  const [slotActiveRuntimeMap, setSlotActiveRuntimeMap] = useState<
    Record<string, boolean>
  >({});
  const layoutWidth = useElementWidth(layoutRef);
  const isAnyEngineTransitioning = transitioningSlotIds.length > 0;
  const primarySlotId = slots[0]?.id ?? null;
  const maxSlotCount =
    layoutWidth > 0
      ? Math.max(1, Math.floor(layoutWidth / PANEL_MIN_WIDTH_PX))
      : 1;
  const canAddSlot = slots.length < maxSlotCount;

  const addSlot = useCallback(() => {
    if (!canAddSlot) {
      return;
    }

    const nextIndex = nextSlotIndexRef.current++;
    setSlots((previousSlots) => [
      ...previousSlots,
      {
        id: `slot-${nextIndex}`,
        engine:
          STORY_MAPPING_ENGINE_OPTIONS[
            (nextIndex - 1) % STORY_MAPPING_ENGINE_OPTIONS.length
          ],
      },
    ]);
  }, [canAddSlot]);

  const updateSlotEngine = useCallback(
    (slotId: string, engine: StoryMappingEngine) => {
      setSlots((previousSlots) =>
        previousSlots.map((slot) =>
          slot.id === slotId ? { ...slot, engine } : slot
        )
      );
    },
    []
  );

  const deleteSlot = useCallback((slotId: string) => {
    setSlots((previousSlots) =>
      previousSlots.length > 1
        ? previousSlots.filter((slot) => slot.id !== slotId)
        : previousSlots
    );
  }, []);

  const handleTransitioningChange = useCallback(
    (slotId: string, isTransitioning: boolean) => {
      setTransitioningSlotIds((previous) => {
        const isAlreadyTransitioning = previous.includes(slotId);
        if (isAlreadyTransitioning === isTransitioning) {
          return previous;
        }

        if (isTransitioning) {
          return [...previous, slotId];
        }

        return previous.filter((id) => id !== slotId);
      });
    },
    []
  );

  useEffect(() => {
    setSlotObservedStates({});
    setSlotActiveRuntimeMap({});
  }, [primarySlotId]);

  const handleSlotObservedStateChange = useCallback(
    (slotId: string, state: ViewState | null) => {
      setSlotObservedStates((previous) => {
        if (previous[slotId] === state) {
          return previous;
        }

        return {
          ...previous,
          [slotId]: state,
        };
      });
    },
    []
  );

  const handleSlotActiveRuntimeChange = useCallback(
    (slotId: string, isActive: boolean) => {
      setSlotActiveRuntimeMap((previous) => {
        if (previous[slotId] === isActive) {
          return previous;
        }

        return {
          ...previous,
          [slotId]: isActive,
        };
      });
    },
    []
  );

  const overlaySourceSlotId =
    controllerId && slots.some((slot) => slot.id === controllerId)
      ? controllerId
      : primarySlotId;
  const overlayVisualizerStates = useMemo(() => {
    return slots.flatMap((slot) => {
      const slotId = slot.id;
      const state = slotObservedStates[slotId];
      return slotActiveRuntimeMap[slotId] === true && state ? [state] : [];
    });
  }, [slotActiveRuntimeMap, slotObservedStates, slots]);
  const overlayActiveCameraIndex = useMemo(() => {
    const activeSlotIds = slots
      .map((slot) => slot.id)
      .filter((slotId) => slotActiveRuntimeMap[slotId] === true);
    const resolvedIndex = overlaySourceSlotId
      ? activeSlotIds.indexOf(overlaySourceSlotId)
      : -1;

    return resolvedIndex >= 0 ? resolvedIndex : 0;
  }, [overlaySourceSlotId, slotActiveRuntimeMap, slots]);
  const overlayFallbackTarget =
    (overlaySourceSlotId ? slotObservedStates[overlaySourceSlotId] : null) ??
    fallbackTarget;
  const shouldRenderOverlay =
    Boolean(overlaySourceSlotId) &&
    slotActiveRuntimeMap[overlaySourceSlotId as string] === true &&
    Boolean(slotObservedStates[overlaySourceSlotId as string]);

  return (
    <>
      <div
        ref={layoutRef}
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
        }}
      >
        <div style={panelsRowStyle}>
          {slots.map((slot, index) => (
            <div key={slot.id} style={panelSlotStyle}>
              <SlotPanelController
                slot={slot}
                fallbackTarget={fallbackTarget}
                allowLeafletFractionalZoom={allowLeafletFractionalZoom}
                shouldAutoClaimOnBoot={index === 0}
                initialBootDelayMs={INITIAL_SLOT_BOOT_DELAY_STEP_MS * index}
                canDelete={slots.length > 1}
                isController={controllerId === slot.id}
                disableEngineSelection={isAnyEngineTransitioning}
                onEngineChange={(engine) => updateSlotEngine(slot.id, engine)}
                onDelete={() => deleteSlot(slot.id)}
                onTransitioningChange={handleTransitioningChange}
                onObservedStateChange={(state) =>
                  handleSlotObservedStateChange(slot.id, state)
                }
                onActiveRuntimeChange={(isActive) =>
                  handleSlotActiveRuntimeChange(slot.id, isActive)
                }
              />
            </div>
          ))}
        </div>
      </div>
      {canAddSlot ? (
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={addSlot}
          className="!h-10 !w-10 !min-w-10 !rounded-full !overflow-hidden !border-white/35 !bg-white/28 !text-slate-800 hover:!bg-white/38 hover:!border-white/45 hover:!text-slate-900"
          style={{
            ...addButtonStyle,
            ...readFrostedGlassBackdropStyle(FROSTED_GLASS_BLUR_PRESET.FAR),
            ...readFrostedGlassShadowStyle(FROSTED_GLASS_BLUR_PRESET.FAR),
          }}
        />
      ) : null}
      {shouldRenderOverlay ? (
        <div style={overlayLayerStyle}>
          <ViewSyncMetaOverlay
            fallbackTarget={overlayFallbackTarget}
            visualizerStates={overlayVisualizerStates}
            visualizerActiveCameraIndex={overlayActiveCameraIndex}
            visualizerWidth={META_VISUAL_WIDTH_PX}
            visualizerHeight={META_VISUAL_HEIGHT_PX}
            style={{
              position: "absolute",
              top: 44,
              right: 12,
              zIndex: 1,
            }}
          />
        </div>
      ) : null}
    </>
  );
};
