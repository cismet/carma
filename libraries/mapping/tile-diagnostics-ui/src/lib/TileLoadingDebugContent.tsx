import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfigProvider } from "antd";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  createMetricRecorder,
  type MetricRecorder,
  type StripChart,
} from "@carma-commons/ui/components";
import {
  acquireSharedThreeScene,
  type ThreeTilesRuntime,
  type TileCameraSnapshot,
  type TileDiagnosticModel as OverlayModel,
  type TileDiagnosticQueueRow as QueueRow,
  type TileDiagnosticSummary as CoverageSummary,
  type TileDiagnostics,
} from "@carma-mapping/engines/maplibre";

import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";
import { TileLoadingDebugLegend } from "./TileLoadingDebugLegend";
import { TileLoadingDebugMeshStyle } from "./TileLoadingDebugMeshStyle";
import { TileLoadingDebugOverviewOptions } from "./TileLoadingDebugOverviewOptions";
import { TileLoadingDebugPanelWindow } from "./TileLoadingDebugPanelWindow";
import { TileLoadingDebugQueue } from "./TileLoadingDebugQueue";
import { TileLoadingDebugStats } from "./TileLoadingDebugStats";
import { TileLoadingDebugToolbar } from "./TileLoadingDebugToolbar";
import { captureTileLoadingDebugSnapshot } from "./tile-loading-debug-snapshot";
import { createTileLoadingDebugPanels } from "./tile-loading-debug-panels";
import {
  EMPTY_MODEL,
  readRuntime,
  useTileLoadingDebugRuntime,
} from "./use-tile-loading-debug-runtime";
import {
  DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
  type ResolvedDebugOptions,
  type TileLoadingDebugProps,
} from "./tile-loading-debug-options";
import panelCss from "./TileLoadingDebugPanels.css?inline";

export const createTileLoadingDebugContent = (diagnostics: TileDiagnostics) => {
  const { FILL, OVERVIEW_COLORS, HOVER, tileId, tileError } = diagnostics;
  const TileDiagnosticOverlay =
    createTileDiagnosticOverlayComponent(diagnostics);
  const DIAGNOSTIC_THEME = {
    token: { borderRadius: 2, fontSize: 12, colorPrimary: "#2672b5" },
  };
  const diagnosticPopupContainer = (trigger?: HTMLElement) =>
    trigger?.ownerDocument.body ?? document.body;

  type Hover = { tile: Tile; parent: Tile | null; siblings: Tile[] } | null;

  /** Overlay, metrics, queue and log for one map; owns every update so the map's props stay stable. */
  const TileLoadingDebugPanel = ({
    map,
    recorder,
    options,
    runtimeHandle,
    onOptionsChange,
    paused,
    onPausedChange,
    toolbarHost,
    initialOverviewPosition,
  }: {
    map: MapLibreMap;
    recorder: MetricRecorder;
    options: ResolvedDebugOptions;
    runtimeHandle: ThreeTilesRuntime;
    onOptionsChange: (patch: Partial<ResolvedDebugOptions>) => void;
    paused: boolean | null;
    onPausedChange: (paused: boolean) => void;
    toolbarHost: HTMLElement;
    initialOverviewPosition?: { left: number; top: number };
  }) => {
    const optionsRef = useRef(options);
    optionsRef.current = options;
    const [frozenImage, setFrozenImage] = useState<string | null>(null);
    const exportRef = useRef<() => void>(() => {});
    useEffect(() => {
      const lease = acquireSharedThreeScene(map);
      const freeze = () => {
        try {
          setFrozenImage(map.getCanvas().toDataURL("image/png"));
        } catch {
          setFrozenImage(null);
        }
        lease.layer.setRenderingPaused(true);
      };
      if (paused) {
        map.stop();
        map.once("render", freeze);
        map.triggerRepaint();
      } else {
        lease.layer.setRenderingPaused(false);
        setFrozenImage(null);
      }
      return () => {
        map.off("render", freeze);
        lease.layer.setRenderingPaused(false);
        lease.release();
      };
    }, [map, paused]);
    useEffect(() => {
      if (options.meshFillOpacity === undefined) return;
      runtimeHandle.appearance.setOpacity(options.meshFillOpacity);
      map.triggerRepaint();
    }, [runtimeHandle, map, options.meshFillOpacity]);
    // High-frequency snapshots belong to the overlay, not to the window chrome.
    const latestModel = useRef<OverlayModel>(EMPTY_MODEL);
    const modelListeners = useRef(new Set<(model: OverlayModel) => void>());
    const setModel = useCallback((model: OverlayModel) => {
      latestModel.current = model;
      for (const listener of modelListeners.current) listener(model);
    }, []);
    const subscribeModel = useCallback(
      (listener: (model: OverlayModel) => void) => {
        modelListeners.current.add(listener);
        listener(latestModel.current);
        return () => {
          modelListeners.current.delete(listener);
        };
      },
      []
    );
    const cameraListeners = useRef(
      new Set<
        (camera: THREE.Camera, cameras: readonly TileCameraSnapshot[]) => void
      >()
    );
    const liveCamera = useRef<THREE.Camera | null>(null);
    const liveSecondaryCameras = useRef<readonly TileCameraSnapshot[]>([]);
    const [cameraIds, setCameraIds] = useState<string[]>([]);
    const cameraIdsKey = useRef("");
    const subscribeCamera = useCallback(
      (
        listener: (
          camera: THREE.Camera,
          cameras: readonly TileCameraSnapshot[]
        ) => void
      ) => {
        cameraListeners.current.add(listener);
        if (liveCamera.current)
          listener(liveCamera.current, liveSecondaryCameras.current);
        return () => {
          cameraListeners.current.delete(listener);
        };
      },
      []
    );
    const [summary, setSummary] = useState<CoverageSummary | null>(null);
    const [queue, setQueue] = useState<QueueRow[]>([]);
    const queueHistory = useRef(new Map<Tile, QueueRow>());
    const [externalPanels, setExternalPanels] = useState<
      Record<string, boolean>
    >({});
    const externalSizes = useRef<
      Record<string, { width: number; height: number }>
    >({});
    const [panelPositions, setPanelPositions] = useState<
      Record<string, { left: number; top: number }>
    >(
      (): Record<string, { left: number; top: number }> =>
        initialOverviewPosition ? { overview: initialOverviewPosition } : {}
    );
    const [frontPanel, setFrontPanel] = useState("legend");
    const [legendExpanded, setLegendExpanded] = useState(false);
    const panelDrag = useRef<{
      id: string;
      x: number;
      y: number;
      left: number;
      top: number;
      maxLeft: number;
      maxTop: number;
      dx: number;
      dy: number;
      element: HTMLElement;
    } | null>(null);
    const [runtimeReady, setRuntimeReady] = useState(false);
    const [freeView, setFreeView] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null);
    const [overviewOrbit, setOverviewOrbit] = useState({ yaw: 0, pitch: 0 });
    const [hover, setHoverState] = useState<Hover>(null);
    const hoverRef = useRef<Hover>(null);
    const chartRef = useRef<StripChart | null>(null);
    const chartHistoryRef = useRef<StripChart | null>(null);
    useEffect(
      () => () => {
        chartHistoryRef.current?.destroy();
        chartHistoryRef.current = null;
      },
      [runtimeHandle]
    );
    const statusRef = useRef<HTMLOutputElement>(null);
    useEffect(() => {
      if (
        !options.showCharts ||
        options.hideAllDebugPanels ||
        !options.telemetryEnabled
      )
        chartRef.current = null;
    }, [
      options.showCharts,
      options.hideAllDebugPanels,
      options.telemetryEnabled,
    ]);
    const latest = useRef<Record<string, number>>({});
    const setHover = useCallback(
      (tile: Tile | null) => {
        const next: Hover = tile
          ? {
              tile,
              parent: tile.parent ?? null,
              siblings: (tile.parent?.children ?? []).filter((c) => c !== tile),
            }
          : null;
        hoverRef.current = next;
        setHoverState(next);
        map.triggerRepaint();
      },
      [map]
    );

    // Loader knobs use the exact runtime mounted by this story host.
    const handleOf = () => runtimeHandle;
    useEffect(() => {
      const handle = handleOf();
      if (!handle || paused === null) return;
      const previouslyPaused = readRuntime(handle)?.loadingPaused ?? false;
      handle.loading.setPaused(paused);
      map.triggerRepaint();
      if (optionsRef.current.telemetryEnabled)
        recorder.log(paused ? "loading paused" : "loading resumed");
      // The diagnostic pause must not survive closing or changing this runtime.
      return () => {
        handle.loading.setPaused(previouslyPaused);
        map.triggerRepaint();
      };
    }, [map, paused, recorder, runtimeHandle, runtimeReady]);
    useEffect(() => {
      const handle = handleOf();
      if (!handle) return;
      if (
        options.foveation === undefined &&
        options.tilesetMinResolutionPx === undefined &&
        options.parseJobs === undefined &&
        options.cacheBudgetMB === undefined
      )
        return;
      if (optionsRef.current.telemetryEnabled)
        recorder.log(
          `loader options: foveation ${options.foveation}, residual ${
            options.tilesetMinResolutionPx || "hint"
          } px, parse jobs ${options.parseJobs}, cache budget ${
            options.cacheBudgetMB
          } MB`
        );
    }, [
      map,
      recorder,
      runtimeHandle,
      runtimeReady,
      options.foveation,
      options.tilesetMinResolutionPx,
      options.parseJobs,
      options.cacheBudgetMB,
    ]);

    useTileLoadingDebugRuntime(diagnostics, {
      map,
      recorder,
      runtimeHandle,
      options,
      optionsRef,
      cameraIdsKey,
      cameraListeners,
      liveCamera,
      liveSecondaryCameras,
      latest,
      hoverRef,
      queueHistory,
      chartRef,
      statusRef,
      setCameraIds,
      setHover,
      setModel,
      setQueue,
      setRuntimeReady,
      setSummary,
    });

    const hoverTile = hover?.tile ?? null;
    const renderOverlay = (popout: boolean) => (
      <TileDiagnosticOverlay
        subscribeModel={subscribeModel}
        subscribeCamera={subscribeCamera}
        updateOnRender={options.updateOnRender}
        followCamera={options.overviewView === "frustum"}
        cameraFocus={options.overviewCameraFocus ?? "all"}
        followPaddingPercent={options.overviewPaddingPercent ?? 200}
        showFrustum={options.showFrustum}
        orbit={overviewOrbit}
        freeView={popout && options.overviewView === "free" ? freeView : null}
        popout={popout}
        opacity={options.overlayOpacity}
        labels={options.overlayLabels}
        up={options.overviewUp}
        interactive={
          popout &&
          (options.overviewView === "free" ||
            options.overviewView === "frustum")
        }
        onViewChange={(view) => {
          setFreeView(view);
          if (view && options.overviewView === "frustum")
            onOptionsChange({ overviewView: "free" });
        }}
        onOrbitChange={setOverviewOrbit}
        onReset={() => {
          setOverviewOrbit({ yaw: 0, pitch: 0 });
          setFreeView(null);
          onOptionsChange({ overviewView: "frustum" });
        }}
        hover={hover}
        onHover={setHover}
      />
    );

    const renderQueue = () => (
      <TileLoadingDebugQueue
        queue={queue}
        summary={summary}
        hoverTile={hoverTile}
        onClear={() => {
          queueHistory.current.clear();
          setQueue([]);
        }}
        onHover={setHover}
      />
    );

    const renderStats = () => (
      <TileLoadingDebugStats
        summary={summary}
        hover={hover}
        tileId={tileId}
        tileError={tileError}
      />
    );

    const renderMeshStyle = () => (
      <TileLoadingDebugMeshStyle
        options={options}
        onOptionsChange={onOptionsChange}
      />
    );

    const renderOverviewOptions = () => (
      <TileLoadingDebugOverviewOptions
        options={options}
        onOptionsChange={onOptionsChange}
        overviewMode={overviewMode}
        setOverviewMode={setOverviewMode}
        map={map}
        cameraIds={cameraIds}
        setFreeView={setFreeView}
      />
    );

    const overviewMode = options.showOverviewPanel
      ? "window"
      : options.showOverlay
      ? "overlay"
      : "off";
    const setOverviewMode = (mode: "off" | "overlay" | "window") =>
      onOptionsChange({
        showOverlay: mode === "overlay",
        showOverviewPanel: mode === "window",
        ...(mode === "overlay" && options.overviewView === "free"
          ? { overviewView: "extent" as const }
          : {}),
        hideAllDebugPanels: false,
        telemetryEnabled: true,
      });
    // Metrics ticks do not rebuild the GPU scene or the legend.
    const overviewIsExternal = externalPanels.overview === true;
    const mapOverlay = useMemo(
      () =>
        overviewMode === "overlay" &&
        !overviewIsExternal &&
        options.telemetryEnabled &&
        !options.hideAllDebugPanels
          ? renderOverlay(false)
          : null,
      [options, freeView, hover, overviewIsExternal]
    );
    const windowOverlay = useMemo(
      () =>
        (overviewMode === "window" || overviewIsExternal) &&
        options.telemetryEnabled &&
        !options.hideAllDebugPanels
          ? renderOverlay(true)
          : null,
      [options, freeView, hover, overviewIsExternal]
    );
    const legend = useMemo(
      () => (
        <TileLoadingDebugLegend
          popout={overviewMode === "window" || overviewIsExternal}
          fill={FILL}
          colors={OVERVIEW_COLORS}
          hoverColors={HOVER}
        />
      ),
      [overviewMode, overviewIsExternal]
    );
    const renderOverview = (windowed: boolean) => (
      <div
        data-test-id="mesh-coverage-overview-component"
        data-mode={windowed ? "window" : "overlay"}
        style={{ position: "relative", height: "100%" }}
      >
        {windowed && windowOverlay}
      </div>
    );
    const panels = createTileLoadingDebugPanels({
      options,
      onOptionsChange,
      onExport: () => exportRef.current(),
      overviewMode,
      renderMeshStyle,
      renderOverview,
      renderOverviewOptions,
      legend,
      renderQueue,
      renderStats,
      chartHistoryRef,
      chartRef,
      recorder,
    });
    exportRef.current = () =>
      captureTileLoadingDebugSnapshot({
        map,
        recorder,
        runtimeHandle,
        options,
        paused,
        summary,
        model: latestModel.current,
        frozenImage,
      });
    const toolsVisible =
      options.telemetryEnabled && !options.hideAllDebugPanels;
    const toolbar = useMemo(
      () => (
        <TileLoadingDebugToolbar
          options={options}
          onOptionsChange={onOptionsChange}
          toolsVisible={toolsVisible}
          paused={paused}
          onPausedChange={onPausedChange}
          panels={panels}
        />
      ),
      [options, onOptionsChange, toolsVisible, paused, onPausedChange]
    );
    return (
      <ConfigProvider
        componentSize="small"
        theme={DIAGNOSTIC_THEME}
        getPopupContainer={diagnosticPopupContainer}
      >
        <style>{panelCss}</style>
        {createPortal(toolbar, toolbarHost)}
        {frozenImage && (
          <img
            src={frozenImage}
            alt="Paused scene"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 1,
              pointerEvents: "auto",
            }}
          />
        )}
        {toolsVisible &&
          overviewMode === "overlay" &&
          !overviewIsExternal &&
          mapOverlay}
        {panels.map((panel) => (
          <TileLoadingDebugPanelWindow
            key={panel.id}
            panel={panel}
            externalPanels={externalPanels}
            externalSizes={externalSizes}
            panelPositions={panelPositions}
            frontPanel={frontPanel}
            legendExpanded={legendExpanded}
            panelDrag={panelDrag}
            setExternalPanels={setExternalPanels}
            setPanelPositions={setPanelPositions}
            setFrontPanel={setFrontPanel}
            setLegendExpanded={setLegendExpanded}
            toolsVisible={toolsVisible}
            overviewMode={overviewMode}
            overviewIsExternal={overviewIsExternal}
            options={options}
            onOptionsChange={onOptionsChange}
            setOverviewMode={setOverviewMode}
            summary={summary}
            renderOverview={renderOverview}
          />
        ))}
        {toolsVisible && (
          <output
            ref={statusRef}
            data-test-id="mesh-coverage-status"
            data-status={JSON.stringify(summary)}
            style={{ display: "none" }}
          />
        )}
      </ConfigProvider>
    );
  };

  /**
   * Shared tile-loading diagnostics used by Coverage and the array-camera stories.
   * The closed launcher does not mount observers, charts or scene diagnostics.
   */
  const TileLoadingDebugContent = ({
    map,
    runtimeHandle,
    options,
    onOptionsChange,
    recorder,
    toolbarHost,
    initialOverviewPosition,
  }: TileLoadingDebugProps & { toolbarHost: HTMLElement }) => {
    const [paused, setPaused] = useState<boolean | null>(null);
    const [localOptions, setLocalOptions] = useState<
      Partial<ResolvedDebugOptions>
    >({});
    const ownedRecorder = useRef<MetricRecorder | null>(null);
    const resolvedOptions = useMemo(
      () => ({
        ...DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
        ...options,
        ...localOptions,
      }),
      [options, localOptions]
    );
    const updateOptions = useCallback(
      (patch: Partial<ResolvedDebugOptions>) => {
        if (onOptionsChange) onOptionsChange(patch);
        else setLocalOptions((current) => ({ ...current, ...patch }));
      },
      [onOptionsChange]
    );
    if (runtimeHandle) {
      if (!recorder && !ownedRecorder.current)
        ownedRecorder.current = createMetricRecorder({
          capacity: 120,
          logCapacity: 300,
        });
      return (
        <TileLoadingDebugPanel
          map={map}
          runtimeHandle={runtimeHandle}
          recorder={recorder ?? ownedRecorder.current!}
          options={resolvedOptions}
          onOptionsChange={updateOptions}
          paused={paused}
          onPausedChange={setPaused}
          toolbarHost={toolbarHost}
          initialOverviewPosition={initialOverviewPosition}
        />
      );
    }

    return null;
  };

  return TileLoadingDebugContent;
};
