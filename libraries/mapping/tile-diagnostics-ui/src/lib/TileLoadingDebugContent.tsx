import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  startTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import panelCss from "./TileLoadingDebugPanels.css?inline";
import { createTileDiagnosticOverlayComponent } from "./TileDiagnosticOverlay";
// The popup window belongs to the library, so the overview can pop out too.
import { DiagnosticWindow as Popout } from "./DiagnosticWindow";
import {
  SHADOW_CORRIDOR_CAMERA_ID,
  snapshotShadowCorridorCameras,
} from "./shadow-corridor-camera";
import type {
  TileDiagnosticQueueRow as QueueRow,
  TileDiagnosticSummary as CoverageSummary,
  TileDiagnostics,
  TileDiagnosticKind as Kind,
  TileDiagnosticRect as OverlayRect,
  TileDiagnosticModel as OverlayModel,
  DiagnosticRuntimeTile as RuntimeTile,
  TilesRuntimeDebugState,
  TileCameraSnapshot,
} from "@carma-mapping/engines/maplibre";
import {
  DiagnosticChoice,
  DiagnosticSection,
  DiagnosticWindowActions,
  DIAGNOSTIC_BOOLEAN_CHOICES,
} from "./DiagnosticControls";
import { Button, ColorPicker, ConfigProvider, Slider, Tooltip } from "antd";
import { StyleProvider } from "@ant-design/cssinjs";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCrosshairs,
  faHand,
  faBars,
  faChartLine,
  faGaugeHigh,
  faDrawPolygon,
  faGripVertical,
  faLayerGroup,
  faCircleInfo,
  faChevronUp,
  faChevronDown,
  faSliders,
  faMinus,
  faPause,
  faPlay,
  faFileExport,
  faTableCells,
  faTerminal,
} from "@fortawesome/free-solid-svg-icons";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Tile } from "3d-tiles-renderer/core";
import type { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";

import {
  MetricLog,
  StripChartPanel,
  createMetricRecorder,
  type MetricRecorder,
  type StripChart,
  type StripChartRow,
} from "@carma-commons/ui/components";
import {
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
  type ThreeTilesRuntime,
} from "@carma-mapping/engines/maplibre";

import {
  DEFAULT_TILE_LOADING_DEBUG_OPTIONS,
  DEBUG_COLOR_MODES,
  type DebugColorModeName,
  type ResolvedDebugOptions,
  type TileLoadingDebugOptions,
  type TileLoadingDebugProps,
} from "./tile-loading-debug-options";

export const createTileLoadingDebugContent = (diagnostics: TileDiagnostics) => {
  const {
    FILL,
    OVERVIEW_COLORS,
    createTileDiagnosticScene,
    HOVER,
    tileWorldBox,
    loadingTilesOf,
    tileId,
    tileError,
    levelsToTarget,
    captureTileDiagnostics,
    summarizeTileDiagnostics,
    updateTileDiagnosticQueue,
  } = diagnostics;
  const TileDiagnosticOverlay =
    createTileDiagnosticOverlayComponent(diagnostics);
  const SAMPLE_INTERVAL_MS = 500;
  // Scene capture can be slower than presentation; the worker reuses GPU geometry
  // while camera matrices reach the overview worker directly on every scene frame.
  const OVERLAY_INTERVAL_MS = 100;
  const DIAGNOSTIC_THEME = {
    token: { borderRadius: 2, fontSize: 12, colorPrimary: "#2672b5" },
  };
  const diagnosticPopupContainer = (trigger?: HTMLElement) =>
    trigger?.ownerDocument.body ?? document.body;
  const IDLE_TIMEOUT_MS = 300;

  const readRuntime = (runtime: ThreeTilesRuntime) => runtime.debug.readState();

  const LEGEND: ReadonlyArray<[Kind, string]> = [
    ["displayed", "drawn (including fallback coverage)"],
    ["resident", "not drawn; see symbol for load state"],
  ];

  /** One column per animation frame; the labels refresh four times a second. */
  const CHART_ROWS: readonly StripChartRow[] = [
    {
      id: "frameMs",
      label: "frame",
      unit: "ms",
      color: "#2563eb",
      min: 0,
      max: 50,
      format: (v) => v.toFixed(1),
    },
    {
      id: "traversalMs",
      label: "tile traversal",
      unit: "ms",
      color: "#7c3aed",
      min: 0,
      format: (v) => v.toFixed(1),
    },
    {
      id: "overlayMs",
      label: "overlay build",
      unit: "ms",
      color: "#0891b2",
      min: 0,
      format: (v) => v.toFixed(1),
    },
    {
      id: "chartMs",
      label: "chart push",
      unit: "ms",
      color: "#0891b2",
      min: 0,
      format: (v) => v.toFixed(2),
    },
    {
      id: "triangles",
      label: "triangles",
      unit: "k",
      color: "#16a34a",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "drawCalls",
      label: "draw calls",
      color: "#16a34a",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "queued",
      label: "queued",
      color: "#ca8a04",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "downloading",
      label: "downloading",
      color: "#ea580c",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "parsing",
      label: "parsing",
      color: "#dc2626",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "downloadsPerS",
      label: "downloads / s",
      color: "#ea580c",
      min: 0,
      format: (v) => v.toFixed(1),
    },
    {
      id: "downloadMs",
      label: "download, mean",
      unit: "ms",
      color: "#ea580c",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "preparedPerS",
      label: "prepared / s",
      color: "#dc2626",
      min: 0,
      format: (v) => v.toFixed(1),
    },
    {
      id: "prepareMs",
      label: "prepare, mean",
      unit: "ms",
      color: "#dc2626",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "displayed",
      label: "displayed tiles",
      color: "#16a34a",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "cacheMB",
      label: "tile cache",
      unit: "MB",
      color: "#475569",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "pressure",
      label: "cache / ceiling",
      unit: "%",
      color: "#475569",
      min: 0,
      max: 100,
      format: (v) => v.toFixed(0),
    },
    {
      id: "heapMB",
      label: "JS heap",
      unit: "MB",
      color: "#475569",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "textures",
      label: "GPU textures",
      color: "#475569",
      min: 0,
      format: (v) => v.toFixed(0),
    },
    {
      id: "target",
      label: "error target",
      unit: "px",
      color: "#0f172a",
      min: 0,
      max: 24,
      format: (v) => v.toFixed(0),
    },
  ];

  type Hover = { tile: Tile; parent: Tile | null; siblings: Tile[] } | null;

  const EMPTY_MODEL: OverlayModel = {
    width: 0,
    height: 0,
    extent: null,
    intersectionEdges: null,
    centerHit: null,
    footprintBounds: null,
    rects: [],
    target: 0,
  };

  const describeChanges = (
    previous: CoverageSummary | null,
    next: CoverageSummary
  ): string[] => {
    const lines: string[] = [];
    if (!previous) {
      lines.push(
        `runtime attached: floor ${next.floorTotal} tiles, target ${next.target} px`
      );
      return lines;
    }
    if (previous.target !== next.target)
      lines.push(`error target ${previous.target} → ${next.target} px`);
    if (previous.memoryTarget !== next.memoryTarget)
      lines.push(
        `memory-adaptive target ${previous.memoryTarget.toFixed(
          1
        )} → ${next.memoryTarget.toFixed(1)} px`
      );
    if (previous.ready !== next.ready)
      lines.push(next.ready ? "base coverage ready" : "base coverage pending");
    if (
      previous.floorLoaded !== next.floorLoaded ||
      previous.floorTotal !== next.floorTotal
    )
      lines.push(`floor ${next.floorLoaded}/${next.floorTotal} loaded`);
    if (previous.uncovered !== next.uncovered)
      lines.push(
        next.uncovered > 0
          ? `WARNING ${next.uncovered} floor tiles without a loaded cut`
          : "every floor tile has a loaded cut"
      );
    if (previous.pending !== next.pending && next.pending > 0)
      lines.push(`${next.pending} floor tiles pending`);
    if (
      previous.displayed !== next.displayed ||
      previous.underlay !== next.underlay
    )
      lines.push(
        `displayed ${next.displayed} (${
          next.displayed - previous.displayed >= 0 ? "+" : ""
        }${next.displayed - previous.displayed}), underlay ${next.underlay}`
      );
    if (previous.full !== next.full)
      lines.push(
        next.full
          ? "WARNING cache at the admission ceiling"
          : "cache below the ceiling"
      );
    if (previous.paused !== next.paused)
      lines.push(next.paused ? "loading paused" : "loading resumed");
    if (Math.abs(previous.resident - next.resident) >= 10)
      lines.push(
        `resident ${next.resident} tiles, ${next.cachedMB.toFixed(0)} MB`
      );
    return lines;
  };

  const requestIdle = (
    callback: () => void,
    timeout = IDLE_TIMEOUT_MS
  ): number => {
    const host = window as unknown as {
      requestIdleCallback?: (
        cb: () => void,
        options: { timeout: number }
      ) => number;
    };
    return host.requestIdleCallback
      ? host.requestIdleCallback(callback, { timeout })
      : window.setTimeout(callback, 16);
  };
  const cancelIdle = (handle: number) => {
    const host = window as unknown as {
      cancelIdleCallback?: (h: number) => void;
    };
    if (host.cancelIdleCallback) host.cancelIdleCallback(handle);
    else window.clearTimeout(handle);
  };

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
    >(() =>
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
    const [hover, setHoverState] = useState<Hover>(null);
    const hoverRef = useRef<Hover>(null);
    const chartRef = useRef<StripChart | null>(null);
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

    useEffect(() => {
      runtimeHandle.debug.setDiagnosticsEnabled(options.telemetryEnabled);
      if (!options.telemetryEnabled) return;
      const lease = acquireSharedThreeScene(map);
      const box = new THREE.Box3();
      let disposed = false;
      let idleHandle = 0;
      let overlayTimer = 0;
      let renderWork: (() => void) | null = null;
      let overlayDue = false;
      let lastOverlayAt = 0;
      let frames = 0;
      let frameMaxMs = 0;
      let lastFrameAt = performance.now();
      let lastSampleAt = performance.now();
      let triangles = 0;
      let drawCalls = 0;
      let textures = 0;
      let geometries = 0;
      let longTasks = 0;
      let overlayMs = 0;
      let previous: CoverageSummary | null = null;
      let frameHandle = 0;
      let renderCamera: THREE.Camera | null = null;
      // Pipeline telemetry: resource timing of tile downloads, and the time from
      // a download's end to the model's arrival (parse queue wait + parse).
      const responseEnd = new Map<string, number>();
      let downloads = 0;
      let downloadBytes = 0;
      let downloadMs = 0;
      let prepared = 0;
      let prepareMs = 0;
      let resourceObserver: PerformanceObserver | null = null;
      try {
        resourceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            if (!/\.(b3dm|glb|gltf)(?:[?#]|$)/i.test(entry.name)) continue;
            downloads += 1;
            downloadBytes += entry.transferSize || entry.encodedBodySize || 0;
            downloadMs += entry.duration;
            responseEnd.set(entry.name, entry.responseEnd);
            if (responseEnd.size > 4000)
              responseEnd.delete(responseEnd.keys().next().value as string);
          }
        });
        resourceObserver.observe({ type: "resource", buffered: false });
      } catch {
        resourceObserver = null;
      }
      const onModel = (event: { url?: string }) => {
        prepared += 1;
        const end = event.url ? responseEnd.get(event.url) : undefined;
        if (end !== undefined) prepareMs += performance.now() - end;
      };
      // The tiles runtime attaches after the style loads: subscribe once it exists.
      let modelSource: TilesRenderer | null = null;
      const subscribeModels = () => {
        const tiles = readRuntime(runtimeHandle)?.tiles ?? null;
        if (!tiles || tiles === modelSource) return;
        modelSource?.removeEventListener("load-model", onModel as never);
        modelSource = tiles;
        tiles.addEventListener("load-model", onModel as never);
      };
      let lastCachedBytes = 0;

      // Scene labels: CSS2D billboards at the top-plane centre of each displayed
      // tile, projected with the shared scene's render camera by a runtime
      // registered next to the tiles runtime. Hover extents live in the scene.
      const labelRenderer = new CSS2DRenderer();
      const labelHost = labelRenderer.domElement;
      Object.assign(labelHost.style, {
        position: "absolute",
        inset: "0",
        pointerEvents: "none",
        overflow: "hidden",
      });
      map.getContainer().appendChild(labelHost);
      const labelScene = new THREE.Scene();
      const labels = new Map<Tile, CSS2DObject>();
      const sceneDiagnostics = createTileDiagnosticScene(
        lease.layer.getScene(),
        () => optionsRef.current,
        () => map.triggerRepaint()
      );
      const { syncLoadedGeometry, syncSceneExtents, syncDebugPlugin } =
        sceneDiagnostics;

      let labelSize = { width: 0, height: 0 };
      let cameraWork: (() => void) | null = null;
      let pendingCameraViews: readonly TileCameraSnapshot[] = [];
      // Display only: the corridor arrives through the shared-scene shadow
      // contract every runtime already receives, so no demand source, no
      // camera registration and no cost outside an open debugger.
      let pendingShadowCameras: readonly TileCameraSnapshot[] = [];
      const publishCamera = () => {
        cameraWork = null;
        if (disposed || !renderCamera) return;
        liveCamera.current = renderCamera;
        liveSecondaryCameras.current = [
          ...pendingCameraViews,
          ...pendingShadowCameras,
        ].sort((a, b) =>
          a.id.localeCompare(b.id, undefined, { numeric: true })
        );
        const ids = liveSecondaryCameras.current.map((camera) => camera.id);
        const idsKey = ids.join("|");
        if (cameraIdsKey.current !== idsKey) {
          cameraIdsKey.current = idsKey;
          setCameraIds(ids);
        }
        for (const listener of cameraListeners.current)
          listener(renderCamera, liveSecondaryCameras.current);
        if (!labels.size) return;
        const container = map.getContainer();
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (labelSize.width !== width || labelSize.height !== height) {
          labelSize = { width, height };
          labelRenderer.setSize(width, height);
        }
        labelRenderer.render(labelScene, renderCamera);
      };
      const setShadowView: NonNullable<
        SharedThreeSceneRuntime["setShadowView"]
      > = (view) => {
        pendingShadowCameras = snapshotShadowCorridorCameras(view);
        if (renderCamera && !cameraWork)
          cameraWork = diagnostics.scheduleTileDiagnosticTask(
            publishCamera,
            true
          );
      };
      const labelRuntime: SharedThreeSceneRuntime = {
        id: `${runtimeHandle.scene.id}-tile-loading-debug-labels`,
        originLngLat: runtimeHandle.scene.originLngLat,
        root: new THREE.Group(),
        setShadowView,
        // Diagnostics follow the live fit while tile demand holds its committed view.
        setLiveShadowView: setShadowView,
        update(frame: SharedThreeSceneFrame) {
          // Match the camera used by the tile loader, including near/far planes.
          renderCamera = frame.lodCamera;
          pendingCameraViews = frame.tileCameraViews ?? [];
          // Latest-wins mailbox: no DOM layout, React state or worker dispatch
          // in the Three scene callback, and no queue of obsolete camera frames.
          if (!cameraWork)
            cameraWork = diagnostics.scheduleTileDiagnosticTask(
              publishCamera,
              true
            );
        },
        dispose() {
          for (const label of labels.values()) label.element.remove();
          labels.clear();
        },
      };
      lease.layer.addRuntime(labelRuntime);
      // Also in the scene registry, which is where the shadow simulation hands
      // its corridor to the runtimes; the layer list alone never sees it.
      const unregisterLabelRuntime = registerSharedThreeSceneRuntime(
        map,
        labelRuntime
      );

      const syncLabels = (
        wanted: Array<{ tile: Tile; id: string; kind: Kind }>,
        group: THREE.Object3D
      ) => {
        const keep = new Set<Tile>();
        for (const { tile, id } of wanted) {
          keep.add(tile);
          let label = labels.get(tile);
          if (!label) {
            const element = document.createElement("div");
            const stroke = document.createElement("span");
            stroke.textContent = id;
            stroke.setAttribute("aria-hidden", "true");
            Object.assign(stroke.style, {
              position: "absolute",
              inset: "0",
              // Match annotation text-echo-darken: soften bright surroundings
              // without painting a halo over an already darker background.
              color: "rgb(77,77,77)",
              filter: "blur(3px)",
              textShadow: "0 0 2px rgb(77,77,77), 0 0 4px rgb(77,77,77)",
              mixBlendMode: "darken",
              pointerEvents: "none",
            });
            const fill = document.createElement("span");
            fill.textContent = id;
            Object.assign(fill.style, {
              position: "relative",
              color: "#fff",
            });
            element.append(stroke, fill);
            Object.assign(element.style, {
              font: "11px/1 monospace",
              background: "transparent",
              whiteSpace: "nowrap",
              pointerEvents: "auto",
              cursor: "default",
            });
            element.addEventListener("mouseenter", () => setHover(tile));
            element.addEventListener("mouseleave", () => setHover(null));
            label = new CSS2DObject(element);
            labels.set(tile, label);
            labelScene.add(label);
          }
          if (tileWorldBox(tile, group, box))
            label.position.set(
              (box.min.x + box.max.x) / 2,
              box.max.y,
              (box.min.z + box.max.z) / 2
            );
          label.updateMatrixWorld(true);
        }
        for (const [tile, label] of labels) {
          if (keep.has(tile)) continue;
          labelScene.remove(label);
          label.element.remove();
          labels.delete(tile);
        }
      };

      const summarize = (
        state: TilesRuntimeDebugState,
        _floorLeaves: Tile[],
        displayed: number,
        underlay: number,
        stable?: CoverageSummary
      ) =>
        summarizeTileDiagnostics(
          state,
          runtimeHandle,
          displayed,
          underlay,
          stable
        );
      const buildQueue = (state: TilesRuntimeDebugState) =>
        updateTileDiagnosticQueue(
          state,
          queueHistory.current,
          recorder.elapsed()
        );

      let lastDiagnosticKey = "";
      let lastPool = new Map<Tile, number>();
      let lastOverlaySummary: CoverageSummary | null = null;
      let coverageDirty = true;
      let lastDisplayed = 0;
      let lastUnderlay = 0;
      const captureOverlay = async (
        sampleSummary = false
      ): Promise<CoverageSummary | null> => {
        const startedAt = performance.now();
        lastOverlayAt = startedAt;
        const state = readRuntime(runtimeHandle);
        const tiles = state?.tiles;
        const root = tiles?.root;
        const container = map.getContainer();
        const width = container.clientWidth;
        const height = container.clientHeight;
        if (!state || !tiles || !root) {
          setModel({ ...EMPTY_MODEL, width, height });
          return null;
        }
        const group = tiles.group as THREE.Object3D;
        group.updateWorldMatrix(true, false);
        const cache = tiles.lruCache as unknown as {
          itemSet: Map<Tile, unknown>;
        };
        const currentOptions = optionsRef.current;
        const pool = new Map<Tile, number>();
        for (const tile of new Set([
          ...cache.itemSet.keys(),
          ...loadingTilesOf(tiles),
          ...state.displayedMeshFrontier,
          ...state.meshUnderlayFrontier,
          ...state.deferred,
        ])) {
          pool.set(
            tile,
            (tile.internal?.loadingState ?? 0) * 16 +
              Number(state.displayedMeshFrontier.has(tile)) +
              Number(state.meshUnderlayFrontier.has(tile)) * 2 +
              Number(state.deferred.has(tile)) * 4 +
              Number((tile as RuntimeTile).idleRing === true) * 8
          );
        }
        // Sources without a tile tree of their own, terrain above all: their
        // runtime owns the boxes, the capture cuts them with the same main and
        // corridor frustums as the mesh tiles.
        const volumes = lease.layer
          .getRuntimes()
          .filter(
            (runtime) =>
              runtime.id !== runtimeHandle.scene.id &&
              runtime.getActiveTileVolumes
          )
          .flatMap((runtime) => runtime.getActiveTileVolumes?.() ?? []);
        const shadowCamera =
          liveSecondaryCameras.current.find(
            (view) => view.id === SHADOW_CORRIDOR_CAMERA_ID
          ) ?? null;
        const key = [
          width,
          height,
          state.meshContentRevision,
          state.effectiveErrorTarget,
          state.extentGeometricError,
          state.extentFloorPending,
          state.meshBaseCoverageReady,
          ...group.matrixWorld.elements,
          ...(renderCamera?.matrixWorld.elements ?? []),
          ...(renderCamera?.projectionMatrix.elements ?? []),
          JSON.stringify(currentOptions),
          hoverRef.current?.tile && tileId(hoverRef.current.tile),
          volumes.map((volume) => `${volume.id}${volume.state ?? ""}`).join(),
          ...(shadowCamera?.matrixWorld ?? []),
          ...(shadowCamera?.projectionMatrix ?? []),
        ].join("|");
        // Sampling metrics is not a scene change. Compare exact pool membership
        // and phases before doing geometry, hierarchy/SSE audits or React updates.
        if (
          key === lastDiagnosticKey &&
          pool.size === lastPool.size &&
          [...pool].every(([tile, phase]) => lastPool.get(tile) === phase)
        ) {
          overlayMs = performance.now() - startedAt;
          if (sampleSummary) {
            lastOverlaySummary = summarize(
              state,
              [],
              lastDisplayed,
              lastUnderlay,
              coverageDirty ? undefined : lastOverlaySummary ?? undefined
            );
            coverageDirty = false;
          }
          return lastOverlaySummary;
        }
        coverageDirty = true;
        syncLoadedGeometry(group);
        sceneDiagnostics.syncHoverHelpers(group, hoverRef.current);
        const captured = await captureTileDiagnostics(
          state,
          renderCamera,
          {
            ...currentOptions,
            showSize: currentOptions.overviewSize,
            showStats: currentOptions.overviewSteps,
            width,
            height,
            volumes,
            shadowCamera,
          },
          () => disposed
        );
        if (!captured || disposed) return null;
        const {
          model: nextModel,
          labelled,
          displayed,
          underlay,
          floorLeaves,
        } = captured;
        syncLabels(currentOptions.sceneLabels ? labelled : [], group);
        syncSceneExtents(nextModel.rects);
        syncDebugPlugin(tiles);
        setModel(nextModel);
        overlayMs = performance.now() - startedAt;
        lastDisplayed = displayed;
        lastUnderlay = underlay;
        if (sampleSummary) {
          lastOverlaySummary = summarize(
            state,
            floorLeaves,
            displayed,
            underlay
          );
          coverageDirty = false;
        }
        lastDiagnosticKey = key;
        lastPool = pool;
        return lastOverlaySummary;
      };

      let pendingCapture: Promise<CoverageSummary | null> | null = null;
      const buildOverlay = (sampleSummary = false) => {
        if (pendingCapture) return pendingCapture;
        pendingCapture = captureOverlay(sampleSummary).finally(() => {
          pendingCapture = null;
          if (!disposed && overlayDue && optionsRef.current.updateOnRender)
            scheduleRenderCapture();
        });
        return pendingCapture;
      };

      // At most one capture plus one latest pending request. Neither mode does
      // tile traversal in the scene's render listener, or drives scene repaint.
      const scheduleRenderCapture = () => {
        if (disposed || renderWork || pendingCapture) return;
        renderWork = diagnostics.scheduleTileDiagnosticTask(() => {
          renderWork = null;
          if (disposed || !overlayDue) return;
          if (!optionsRef.current.updateOnRender) {
            scheduleIdle();
            return;
          }
          overlayDue = false;
          void buildOverlay();
        }, true);
      };

      const runIdle = () => {
        idleHandle = 0;
        if (disposed) return;
        if (!overlayDue) return;
        if (optionsRef.current.updateOnRender) {
          scheduleRenderCapture();
          return;
        }
        const remaining =
          OVERLAY_INTERVAL_MS - (performance.now() - lastOverlayAt);
        if (remaining > 0) {
          if (!overlayTimer)
            overlayTimer = window.setTimeout(() => {
              overlayTimer = 0;
              scheduleIdle();
            }, remaining);
          return;
        }
        overlayDue = false;
        void buildOverlay();
      };
      const scheduleIdle = () => {
        if (idleHandle === 0) idleHandle = requestIdle(runIdle);
      };
      const onRender = () => {
        const info = lease.layer.getRenderer()?.info;
        if (info) {
          triangles = info.render.triangles;
          drawCalls = info.render.calls;
          textures = info.memory.textures;
          geometries = info.memory.geometries;
        }
        overlayDue = true;
        if (optionsRef.current.updateOnRender) {
          if (idleHandle) cancelIdle(idleHandle);
          idleHandle = 0;
          window.clearTimeout(overlayTimer);
          overlayTimer = 0;
          scheduleRenderCapture();
        } else {
          scheduleIdle();
        }
      };
      let chartWork: (() => void) | null = null;
      let lastChartAt = 0,
        latestFrameMs = 0;
      const pushChart = () => {
        chartWork = null;
        if (disposed) return;
        const frameMs = latestFrameMs;
        const chart = chartRef.current;
        if (chart) {
          const state = readRuntime(runtimeHandle);
          const stats = (
            state?.tiles as unknown as
              | {
                  stats?: {
                    queued: number;
                    downloading: number;
                    parsing: number;
                  };
                }
              | undefined
          )?.stats;
          chart.push({
            ...latest.current,
            frameMs,
            traversalMs: state?.lastTraversalMs ?? 0,
            triangles: triangles / 1000,
            drawCalls,
            queued: stats?.queued ?? 0,
            downloading: stats?.downloading ?? 0,
            parsing: stats?.parsing ?? 0,
            chartMs: chart.lastPushMs(),
            target: state?.effectiveErrorTarget ?? 0,
          });
        }
      };
      const countFrames = () => {
        const now = performance.now();
        frames += 1;
        latestFrameMs = now - lastFrameAt;
        frameMaxMs = Math.max(frameMaxMs, latestFrameMs);
        lastFrameAt = now;
        // Aim for 60 Hz without queueing work behind the application render loop.
        if (chartRef.current && !chartWork && now - lastChartAt >= 1000 / 60) {
          lastChartAt = now;
          chartWork = diagnostics.scheduleTileDiagnosticTask(pushChart);
        }
        frameHandle = requestAnimationFrame(countFrames);
      };
      frameHandle = requestAnimationFrame(countFrames);
      let longTaskObserver: PerformanceObserver | null = null;
      try {
        longTaskObserver = new PerformanceObserver((list) => {
          longTasks += list.getEntries().length;
        });
        longTaskObserver.observe({ entryTypes: ["longtask"] });
      } catch {
        longTaskObserver = null;
      }

      let samplePending = false;
      const sample = () => {
        if (disposed || samplePending) return;
        samplePending = true;
        requestIdle(async () => {
          try {
            if (disposed) return;
            const now = performance.now();
            const fps = (frames * 1000) / Math.max(1, now - lastSampleAt);
            frames = 0;
            lastSampleAt = now;
            subscribeModels();
            if (runtimeHandle) setRuntimeReady(true);
            await pendingCapture;
            if (disposed) return;
            const next = await buildOverlay(true);
            if (disposed) return;
            const state = readRuntime(runtimeHandle);
            if (
              state &&
              optionsRef.current.showQueue &&
              !optionsRef.current.hideAllDebugPanels
            ) {
              const nextQueue = buildQueue(state);
              startTransition(() => setQueue(nextQueue));
            }
            // Cross-origin resource timing carries no sizes without a
            // Timing-Allow-Origin header; resident bytes are the runtime's own count.
            const cachedBytes = next ? next.cachedMB * 1e6 : lastCachedBytes;
            const residentDelta = Math.max(0, cachedBytes - lastCachedBytes);
            lastCachedBytes = cachedBytes;
            const heap = (
              performance as unknown as { memory?: { usedJSHeapSize: number } }
            ).memory?.usedJSHeapSize;
            const seconds = Math.max(0.001, SAMPLE_INTERVAL_MS / 1000);
            latest.current = {
              overlayMs,
              downloadsPerS: downloads / seconds,
              downloadMs: downloads > 0 ? downloadMs / downloads : 0,
              preparedPerS: prepared / seconds,
              prepareMs: prepared > 0 ? prepareMs / prepared : 0,
              displayed: next?.displayed ?? 0,
              cacheMB: next?.cachedMB ?? 0,
              pressure:
                next && next.ceilingMB > 0
                  ? (100 * next.cachedMB) / next.ceilingMB
                  : 0,
              heapMB: heap !== undefined ? heap / 1e6 : 0,
              textures,
            };
            recorder.sample({
              fps,
              frameMaxMs,
              longTasks,
              downloading: next?.downloading ?? 0,
              parsing: next?.parsing ?? 0,
              downloadsPerS: downloads / seconds,
              downloadMBs:
                downloadBytes > 0 ? downloadBytes / 1e6 / seconds : Number.NaN,
              residentMBs: residentDelta / 1e6 / seconds,
              downloadMs: downloads > 0 ? downloadMs / downloads : 0,
              preparedPerS: prepared / seconds,
              prepareMs: prepared > 0 ? prepareMs / prepared : 0,
              traversalMs: next?.traversalMs ?? 0,
              overlayMs,
              triangles: triangles / 1000,
              drawCalls,
              textures,
              geometries,
              cacheMB: next?.cachedMB ?? 0,
              pressure:
                next && next.ceilingMB > 0
                  ? (100 * next.cachedMB) / next.ceilingMB
                  : 0,
              heapMB: heap !== undefined ? heap / 1e6 : Number.NaN,
              inFlight: next?.inFlight ?? 0,
              queued: next?.queued ?? 0,
              displayed: next?.displayed ?? 0,
            });
            frameMaxMs = 0;
            longTasks = 0;
            downloads = 0;
            downloadBytes = 0;
            downloadMs = 0;
            prepared = 0;
            prepareMs = 0;
            if (next) {
              for (const line of describeChanges(previous, next))
                recorder.log(line);
              previous = next;
              if (statusRef.current)
                statusRef.current.dataset.status = JSON.stringify(next);
              if (
                (optionsRef.current.showStats ||
                  optionsRef.current.showQueue ||
                  optionsRef.current.showOverviewPanel) &&
                !optionsRef.current.hideAllDebugPanels
              )
                startTransition(() => setSummary(next));
            }
          } finally {
            samplePending = false;
          }
        }, SAMPLE_INTERVAL_MS);
      };
      const onMoveStart = () => recorder.log("move start");
      const onMoveEnd = () => {
        const center = map.getCenter();
        recorder.log(
          `move end: zoom ${(map.getZoom() + 1).toFixed(2)} pitch ${map
            .getPitch()
            .toFixed(0)}° fov ${map
            .getVerticalFieldOfView()
            .toFixed(0)}° at ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
        );
      };
      map.on("render", onRender);
      map.on("movestart", onMoveStart);
      map.on("moveend", onMoveEnd);
      const interval = window.setInterval(sample, SAMPLE_INTERVAL_MS);
      recorder.log("overlay attached");
      sample();
      return () => {
        runtimeHandle.debug.setDiagnosticsEnabled(false);
        map.triggerRepaint();
        disposed = true;
        chartWork?.();
        renderWork?.();
        cameraWork?.();
        map.off("render", onRender);
        map.off("movestart", onMoveStart);
        map.off("moveend", onMoveEnd);
        window.clearInterval(interval);
        window.clearTimeout(overlayTimer);
        if (idleHandle !== 0) cancelIdle(idleHandle);
        cancelAnimationFrame(frameHandle);
        longTaskObserver?.disconnect();
        resourceObserver?.disconnect();
        modelSource?.removeEventListener("load-model", onModel as never);
        queueHistory.current.clear();
        setQueue([]);
        setHover(null);
        setModel(EMPTY_MODEL);
        setSummary(null);
        unregisterLabelRuntime();
        lease.layer.removeRuntime(labelRuntime.id);
        for (const label of labels.values()) label.element.remove();
        labels.clear();
        labelHost.remove();
        sceneDiagnostics.dispose();
        lease.release();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, recorder, runtimeHandle, setHover, options.telemetryEnabled]);

    const hoverTile = hover?.tile ?? null;
    const activeRows = queue.filter(
      (row) => row.state !== "cancelled" && row.state !== "failed"
    );

    const renderOverlay = (popout: boolean) => (
      <TileDiagnosticOverlay
        subscribeModel={subscribeModel}
        subscribeCamera={subscribeCamera}
        updateOnRender={options.updateOnRender}
        followCamera={options.overviewView === "frustum"}
        cameraFocus={options.overviewCameraFocus ?? "overview-live"}
        followPaddingPercent={options.overviewPaddingPercent ?? 200}
        showFrustum={options.showFrustum}
        freeView={popout && options.overviewView === "free" ? freeView : null}
        popout={popout}
        opacity={options.overlayOpacity}
        labels={options.overlayLabels}
        up={options.overviewUp}
        interactive={popout && options.overviewView === "free"}
        onViewChange={setFreeView}
        hover={hover}
        onHover={setHover}
      />
    );

    const renderQueue = () => (
      <div
        data-test-id="mesh-coverage-queue"
        style={{ font: "12px/1.5 monospace", color: "#111" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontWeight: 600,
            padding: "2px 0",
          }}
        >
          <span>
            Scheduled tiles: {activeRows.length} active,{" "}
            {queue.length - activeRows.length} settled · target{" "}
            {summary?.target ?? "–"} px
          </span>
          <span style={{ flex: 1 }} />
          <Button
            onClick={() => {
              queueHistory.current.clear();
              setQueue([]);
            }}
          >
            clear
          </Button>
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#555" }}>
              <th>tile</th>
              <th>depth</th>
              <th>state</th>
              <th style={{ textAlign: "right" }}>error px</th>
              <th
                style={{ textAlign: "right" }}
                title="Estimate assuming error halves per LOD"
              >
                estimated levels
              </th>
              <th style={{ textAlign: "right" }}>since</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row, index) => (
              <tr
                key={index}
                data-tile-id={row.id}
                data-state={row.state}
                onMouseEnter={() => setHover(row.tile)}
                onMouseLeave={() => setHover(null)}
                style={{
                  cursor: "default",
                  color:
                    row.state === "cancelled"
                      ? "#888"
                      : row.state === "failed"
                      ? "#b00"
                      : "#111",
                  background:
                    row.tile === hoverTile ? "rgba(255,212,0,0.35)" : undefined,
                }}
              >
                <td>{row.id}</td>
                <td>{row.depth}</td>
                <td>{row.state}</td>
                <td style={{ textAlign: "right" }}>
                  {Number.isFinite(row.error) ? row.error.toFixed(1) : "–"}
                </td>
                <td style={{ textAlign: "right" }}>{row.levels}</td>
                <td style={{ textAlign: "right" }}>
                  {(row.since / 1000).toFixed(1)} s
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

    const renderStats = () => (
      <div
        data-test-id="mesh-coverage-stats"
        style={{
          display: "flex",
          flexDirection: "column",
          font: "12px monospace",
          color: "#111",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", marginBottom: 4 }}>
          {summary
            ? `Extent floor ${summary.floorLoaded}/${
                summary.floorTotal
              } loaded · ${summary.uncovered} without a loaded cut · ${
                summary.pending
              } pending · displayed ${summary.displayed} · underlay ${
                summary.underlay
              } · resident ${summary.resident} tiles · target ${
                summary.target
              } px (requested ${
                summary.requested
              }, memory ${summary.memoryTarget.toFixed(1)}) · base coverage ${
                summary.ready ? "ready" : "pending"
              }${summary.full ? " · CACHE FULL" : ""}${
                summary.paused ? " · LOADING PAUSED" : ""
              }\n` +
              (hover
                ? `Hover ${tileId(hover.tile)} depth ${
                    hover.tile.internal?.depth ?? "?"
                  } error ${
                    Number.isFinite(tileError(hover.tile))
                      ? tileError(hover.tile).toFixed(1)
                      : "–"
                  } px · parent ${
                    hover.parent ? tileId(hover.parent) : "–"
                  } · siblings ${hover.siblings.map(tileId).join(", ") || "–"}`
                : "Hover a tile id, an overlay label or a queue row to see its extent.")
            : "Waiting for the tiles runtime…"}
        </div>
      </div>
    );

    const renderMeshStyle = () => (
      <div className="tile-debug-form">
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Mesh fill
          <Slider
            style={{ flex: 1 }}
            min={0}
            max={1}
            step={0.05}
            value={options.meshFillOpacity ?? 1}
            onChange={(meshFillOpacity) => onOptionsChange({ meshFillOpacity })}
          />
        </label>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>Wireframe color</span>
          <ColorPicker
            disabledAlpha
            value={options.wireframeColor ?? "#ffe985"}
            onChange={(color) =>
              onOptionsChange({ wireframeColor: color.toHexString() })
            }
          >
            <Button
              aria-label="Wireframe color"
              title="Wireframe color"
              style={{
                color: options.wireframeColor ?? "#ffe985",
                background: "#243444",
              }}
              icon={<FontAwesomeIcon icon={faDrawPolygon} />}
            />
          </ColorPicker>
        </div>
        {(
          [
            ["showTileGeometry", "Wireframe"],
            ["sceneLabels", "Tile labels"],
            ["debugBoxBounds", "Native tile bounding volumes"],
          ] as const
        ).map(([flag, label]) => (
          <DiagnosticChoice
            key={flag}
            label={label}
            value={options[flag]}
            choices={DIAGNOSTIC_BOOLEAN_CHOICES}
            onChange={(value) => onOptionsChange({ [flag]: value })}
          />
        ))}
        <DiagnosticSection
          title="Colors and bounding volumes"
          initiallyOpen={false}
        >
          <DiagnosticChoice
            label="Tile coloring"
            value={options.debugColorMode}
            onChange={(
              debugColorMode: TileLoadingDebugOptions["debugColorMode"]
            ) => onOptionsChange({ debugColorMode })}
            choices={DEBUG_COLOR_MODES.map((value) => ({
              value,
              label: value.toLowerCase().replaceAll("_", " "),
            }))}
          />
          <DiagnosticChoice
            label="Retained geometry extents"
            value={options.sceneExtents}
            onChange={(sceneExtents: TileLoadingDebugOptions["sceneExtents"]) =>
              onOptionsChange({ sceneExtents })
            }
            choices={(["none", "boxes", "edges"] as const).map((value) => ({
              value,
              label: value,
            }))}
          />
          {(
            [
              ["debugSphereBounds", "Native bounding spheres"],
              ["debugParentBounds", "Parent bounds"],
              ["debugUnlit", "Unlit materials"],
            ] as const
          ).map(([flag, label]) => (
            <DiagnosticChoice
              key={flag}
              label={label}
              value={options[flag]}
              choices={DIAGNOSTIC_BOOLEAN_CHOICES}
              onChange={(value) => onOptionsChange({ [flag]: value })}
            />
          ))}
        </DiagnosticSection>
      </div>
    );

    const renderOverviewOptions = () => (
      <div
        className="tile-debug-form"
        data-test-id="mesh-coverage-overview-options"
      >
        <DiagnosticChoice
          label="Overview placement"
          value={overviewMode}
          onChange={setOverviewMode}
          choices={[
            { value: "off", label: "Off" },
            { value: "overlay", label: "Overlay" },
            { value: "window", label: "Window" },
          ]}
        />
        <DiagnosticChoice
          label="Debug updates"
          value={options.updateOnRender ?? false}
          onChange={(updateOnRender: boolean) => {
            onOptionsChange({ updateOnRender });
            map.triggerRepaint();
          }}
          choices={[
            { value: false, label: "Deferred (10 Hz)" },
            { value: true, label: "Every render frame" },
          ]}
        />
        <div style={{ fontSize: 11, color: "#596773" }}>
          Camera always live. Frame mode refreshes tile diagnostics after each
          render; busy captures coalesce. Statistics remain sampled.
        </div>
        {options.overviewView === "frustum" && (
          <DiagnosticChoice
            label="Frustum crop"
            value={options.overviewCameraFocus ?? "overview-live"}
            onChange={(overviewCameraFocus: string) =>
              onOptionsChange({ overviewCameraFocus })
            }
            choices={[
              { value: "overview-live", label: "Main · white" },
              { value: "all", label: "All frustums" },
              ...cameraIds.map((id, i) => ({
                value: id,
                label: `${
                  id.startsWith("coverage-window-")
                    ? `Camera ${
                        Number(id.slice("coverage-window-".length)) + 1
                      }`
                    : id
                } · ${["orange", "green", "violet"][i % 3]}`,
              })),
            ]}
          />
        )}
        {options.overviewView === "frustum" && (
          <label>
            Follow padding: {options.overviewPaddingPercent ?? 200}%
            <Slider
              aria-label="Follow viewport padding"
              min={100}
              max={500}
              step={25}
              value={options.overviewPaddingPercent ?? 200}
              onChange={(overviewPaddingPercent) =>
                onOptionsChange({ overviewPaddingPercent })
              }
            />
            <small>100% fits the viewport; 200% doubles the extent.</small>
          </label>
        )}
        <DiagnosticChoice
          label="Diagnostic up axis"
          value={options.overviewUp}
          onChange={(overviewUp: TileLoadingDebugOptions["overviewUp"]) => {
            setFreeView(null);
            onOptionsChange({ overviewUp });
          }}
          choices={[
            {
              value: "camera-tangent",
              label: "Camera tangent up",
            },
            { value: "tileset", label: "Native tileset Z up" },
          ]}
        />
        {(
          [
            ["showFrustum", "Camera intersection"],
            ["showResident", "Retained tiles"],
          ] as const
        ).map(([flag, label]) => (
          <DiagnosticChoice
            key={flag}
            label={label}
            value={options[flag]}
            choices={DIAGNOSTIC_BOOLEAN_CHOICES}
            onChange={(value) => onOptionsChange({ [flag]: value })}
          />
        ))}
        <DiagnosticSection title="Labels and opacity" initiallyOpen={false}>
          <DiagnosticChoice
            label="Overlay labels"
            value={options.overlayLabels}
            onChange={(
              overlayLabels: TileLoadingDebugOptions["overlayLabels"]
            ) => onOptionsChange({ overlayLabels })}
            choices={(
              ["none", "id", "id and error", "id and stats"] as const
            ).map((value) => ({
              value,
              label:
                value === "id and stats"
                  ? "ID + resident kB (10 kB steps)"
                  : value,
            }))}
          />
          <Slider
            aria-label="Grid opacity"
            min={0}
            max={1}
            step={0.05}
            value={options.overlayOpacity}
            onChange={(overlayOpacity) => onOptionsChange({ overlayOpacity })}
          />
        </DiagnosticSection>
      </div>
    );
    const renderLegend = (popout = false) => (
      <div
        style={{
          font: "12px/1.5 system-ui",
          color: "#e6edf3",
          background: "rgb(38 46 56 / 94%)",
          padding: 12,
          boxSizing: "border-box",
        }}
        data-test-id="mesh-coverage-legend"
      >
        <div>
          {popout &&
            LEGEND.map(([kind, label]) => (
              <div
                key={kind}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    background: FILL[kind],
                    border: "1px solid rgba(0,0,0,0.5)",
                    display: "inline-block",
                  }}
                />
                {label}
              </div>
            ))}
          <div style={{ fontWeight: 600, marginTop: 6 }}>
            Detail versus target
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              alignItems: "center",
              gap: "6px 8px",
              marginTop: 8,
            }}
          >
            <svg
              width="28"
              height="24"
              viewBox="-12 -12 24 24"
              aria-hidden="true"
            >
              <g fill="none" stroke={OVERVIEW_COLORS.quality} strokeWidth="1.5">
                <circle r="10" />
                <circle r="6" />
                <circle r="2" />
              </g>
            </svg>
            <span>Needs finer detail</span>
            <svg
              width="28"
              height="24"
              viewBox="0 0 28 24"
              aria-label="Leaf tile dot"
            >
              <circle cx="14" cy="12" r="3" fill={OVERVIEW_COLORS.quality} />
            </svg>
            <span>Finest available tile · target not met</span>
            <svg
              width="28"
              height="24"
              viewBox="-3.5 -3.5 7 7"
              aria-label="Concentric squares"
            >
              <path
                d="M-3,-3H3V3H-3Z M-1.5,-1.5H1.5V1.5H-1.5Z"
                fill="none"
                stroke={OVERVIEW_COLORS.quality}
                strokeWidth="0.4"
              />
            </svg>
            <span>More detail than requested</span>
            <span style={{ textAlign: "center", color: "#9da7b1" }}>—</span>
            <span>On target · no symbol</span>
          </div>
          <div style={{ color: "#aebac5", fontSize: 11, marginTop: 8 }}>
            One contour per LOD step · ≈ estimated
          </div>
          <div style={{ fontWeight: 600, marginTop: 10 }}>
            Processing · left-to-right phase fill
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr",
              alignItems: "center",
              gap: "6px 8px",
              marginTop: 8,
            }}
          >
            {(
              [
                [0, "Queued"],
                [1 / 3, "Downloading"],
                [2 / 3, "Parsing"],
              ] as const
            ).map(([progress, label]) => (
              <div key={label} style={{ display: "contents" }}>
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: `1.5px solid ${OVERVIEW_COLORS.processing}`,
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: `${progress * 100}%`,
                      height: "100%",
                      background: OVERVIEW_COLORS.processing,
                    }}
                  />
                </span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div style={{ color: "#aebac5", fontSize: 11, marginTop: 8 }}>
            Ready: outline only. Phase fill, not download percentage.
          </div>
          <div style={{ marginTop: 6 }}>× Failed · Ⅱ Deferred</div>
          <div style={{ fontWeight: 600, marginTop: 10 }}>
            Coverage · tile frame
          </div>
          {[
            [OVERVIEW_COLORS.grid, "Viewport · camera demand"],
            [
              OVERVIEW_COLORS.seam,
              "Seam · sibling support and outward LOD rings",
            ],
            [OVERVIEW_COLORS.reserve, "Base resolution · extent coverage"],
            [OVERVIEW_COLORS.baseline, "Outside all views · no LOD target"],
          ].map(([color, label]) => (
            <div
              key={label}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  width: 14,
                  height: 10,
                  border: `2px solid ${color}`,
                  background: "#30363d",
                  flexShrink: 0,
                }}
              />
              {label}
            </div>
          ))}
          <div style={{ fontWeight: 600, marginTop: 10 }}>
            Spatial diagnostics
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${OVERVIEW_COLORS.frustum}`,
                background: OVERVIEW_COLORS.backdrop,
                display: "inline-block",
              }}
            />
            Four camera side planes cut through presented tile bounds
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 14,
                height: 14,
                border: `1px solid ${HOVER.tile}`,
                display: "inline-block",
              }}
            />
            Hovered tile, parent and siblings
          </div>
        </div>
      </div>
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
      () => renderLegend(overviewMode === "window" || overviewIsExternal),
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
    const panels = [
      {
        id: "diagnostic-tools",
        label: "Diagnostics",
        icon: faGaugeHigh,
        flag: "showDiagnosticTools",
        width: 304,
        height: 220,
        left: 330,
        top: 56,
        resize: "vertical",
        content: () => (
          <div className="tile-debug-form">
            <div
              role="group"
              aria-label="Diagnostic windows"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
              }}
            >
              {(
                [
                  ["showQueue", "Queue", faBars],
                  ["showStats", "Statistics", faTableCells],
                  ["showCharts", "Charts", faChartLine],
                  ["showEventLog", "Event log", faTerminal],
                ] as const
              ).map(([flag, label, icon]) => (
                <Button
                  key={flag}
                  type={options[flag] ? "primary" : "default"}
                  aria-pressed={options[flag]}
                  icon={<FontAwesomeIcon icon={icon} />}
                  onClick={() => onOptionsChange({ [flag]: !options[flag] })}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              icon={<FontAwesomeIcon icon={faFileExport} />}
              onClick={() => exportRef.current()}
            >
              Export state, screenshot and logs
            </Button>
            <Button
              type="text"
              icon={<FontAwesomeIcon icon={faMinus} />}
              onClick={() => onOptionsChange({ hideAllDebugPanels: true })}
            >
              Hide all panels
            </Button>
          </div>
        ),
      },
      {
        id: "mesh-style",
        label: "Mesh style",
        icon: faDrawPolygon,
        flag: "showMeshStylePanel",
        width: 320,
        height: 460,
        left: 650,
        top: 56,
        resize: "both",
        content: renderMeshStyle,
      },
      {
        id: "overview",
        label: "Tile overview",
        icon: faLayerGroup,
        flag: "showOverviewPanel",
        width: overviewMode === "overlay" ? 390 : 500,
        height: overviewMode === "overlay" ? 335 : 420,
        left: 12,
        top: 56,
        resize: "both",
        content: () => renderOverview(overviewMode === "window"),
      },
      {
        id: "overview-options",
        label: "Overview options",
        icon: faSliders,
        flag: "showOverviewOptions",
        width: 310,
        height: 460,
        left: 330,
        top: 56,
        resize: "vertical",
        content: renderOverviewOptions,
      },
      {
        id: "legend",
        label: "Overview legend",
        icon: faCircleInfo,
        flag: "showLegend",
        width: 300,
        height: 480,
        left: 12,
        top: 56,
        resize: "both",
        content: () => legend,
      },
      {
        id: "queue",
        label: "Queue",
        icon: faBars,
        flag: "showQueue",
        width: 520,
        height: 270,
        left: 430,
        top: 56,
        resize: "both",
        content: renderQueue,
      },
      {
        id: "stats",
        label: "Statistics",
        icon: faTableCells,
        flag: "showStats",
        width: 480,
        height: 170,
        left: 12,
        top: 390,
        resize: "both",
        content: renderStats,
      },
      {
        id: "charts",
        label: "Charts",
        icon: faChartLine,
        flag: "showCharts",
        width: 620,
        height: 235,
        left: 36,
        top: 420,
        resize: "both",
        content: () => (
          <StripChartPanel
            rows={CHART_ROWS}
            rowHeight={14}
            onChart={(chart) => {
              chartRef.current = chart;
            }}
          />
        ),
      },
      {
        id: "log",
        label: "Event log",
        icon: faTerminal,
        flag: "showEventLog",
        width: 520,
        height: 240,
        left: 520,
        top: 360,
        resize: "both",
        content: () => (
          <MetricLog
            recorder={recorder}
            style={{ height: "100%", minHeight: 0 }}
          />
        ),
      },
    ] as const;
    exportRef.current = () => {
      const page = window.open("", "_blank");
      if (!page) return;
      page.document.body.textContent = "Capturing current scene…";
      const snapshot = {
        capturedAt: new Date().toISOString(),
        story: location.href,
        browser: navigator.userAgent,
        debugEnabled: options.telemetryEnabled,
        paused: !!paused,
        camera: {
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
          padding: map.getPadding(),
        },
        options,
        coverage: runtimeHandle.loading.getCoverageStatus(),
        summary,
        tiles: latestModel.current.rects.map((tile) => ({
          id: tile.id,
          kind: tile.kind,
          quality: tile.quality,
          phase: tile.phase,
        })),
        logs: recorder.entries(),
        metrics: Object.fromEntries(
          CHART_ROWS.map(({ id }) => [id, recorder.series(id)])
        ),
        limitations:
          "Captured manager logs and bounded metric history only; not all browser console or network traffic. Debug-off snapshots have no newly recorded diagnostic history. Review URLs and image content before sharing.",
      };
      const finish = (screenshot: string | null, error?: string) => {
        const doc = document.implementation.createHTMLDocument(
          "Tile manager diagnostic snapshot"
        );
        const title = doc.createElement("h1");
        title.textContent = doc.title;
        const note = doc.createElement("p");
        note.textContent =
          "Local snapshot — download this HTML to share it; its temporary browser URL is not a public link. Images capture the map and camera canvases, not HTML overlays.";
        const copy = doc.createElement("button");
        copy.id = "copy";
        copy.textContent = "Copy state and logs";
        const download = doc.createElement("a");
        download.textContent = "Download complete HTML";
        download.download = "tile-manager-snapshot.html";
        const state = doc.createElement("textarea");
        state.id = "state";
        state.readOnly = true;
        state.value = JSON.stringify(
          { ...snapshot, screenshotError: error },
          null,
          2
        );
        state.textContent = state.value;
        state.style.cssText =
          "display:block;width:98%;height:50vh;margin-top:1em";
        doc.body.style.cssText = "font:14px system-ui;margin:24px";
        doc.body.append(title, note, copy, download);
        if (screenshot) {
          const image = doc.createElement("img");
          image.src = screenshot;
          image.alt = "Captured map canvas";
          image.style.cssText = "display:block;max-width:100%;margin-top:1em";
          doc.body.append(image);
        }
        for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
          '[data-test-id="tile-manager-camera-preview"]'
        )) {
          try {
            const image = doc.createElement("img");
            image.src = canvas.toDataURL("image/png");
            image.alt = "Additional camera viewport";
            image.style.cssText =
              "display:inline-block;max-width:100%;transform:scaleY(-1);margin:8px";
            doc.body.append(image);
          } catch {
            /* The main state and other images remain exportable. */
          }
        }
        doc.body.append(state);
        const script = doc.createElement("script");
        script.textContent =
          "document.getElementById('copy').onclick=()=>{const t=document.getElementById('state');t.select();navigator.clipboard?.writeText(t.value).catch(()=>document.execCommand('copy'));};document.querySelector('a').href=location.href;";
        doc.body.append(script);
        const url = URL.createObjectURL(
          new Blob(["<!doctype html>" + doc.documentElement.outerHTML], {
            type: "text/html",
          })
        );
        page.location.href = url;
        // Keep the self-contained document available while its preview is open.
      };
      if (frozenImage) finish(frozenImage);
      else {
        map.once("render", () => {
          try {
            finish(map.getCanvas().toDataURL("image/png"));
          } catch (error) {
            finish(null, String(error));
          }
        });
        map.triggerRepaint();
      }
    };
    const toolsVisible =
      options.telemetryEnabled && !options.hideAllDebugPanels;
    const toolbar = useMemo(
      () => (
        <>
          {
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                width: "max-content",
              }}
            >
              <fieldset
                disabled={!options.telemetryEnabled}
                style={{
                  display: options.telemetryEnabled ? "contents" : "none",
                }}
              >
                <span
                  role="group"
                  aria-label="Panels"
                  style={{ display: "flex", gap: 2 }}
                >
                  <Button
                    type={options.showOverviewOptions ? "primary" : "text"}
                    aria-label="Overview options"
                    title="Tile overview · options and legend"
                    aria-pressed={!!options.showOverviewOptions && toolsVisible}
                    icon={<FontAwesomeIcon icon={faLayerGroup} />}
                    onClick={() =>
                      onOptionsChange({
                        showOverviewOptions:
                          !toolsVisible || !options.showOverviewOptions,
                        hideAllDebugPanels: false,
                      })
                    }
                  />
                  {panels
                    .filter((panel) => panel.id !== "overview-options")
                    .map((panel) => (
                      <Tooltip key={panel.id} title={panel.label}>
                        <Button
                          type={options[panel.flag] ? "primary" : "text"}
                          icon={<FontAwesomeIcon icon={panel.icon} />}
                          aria-label={panel.label}
                          aria-pressed={
                            options[panel.flag] && !options.hideAllDebugPanels
                          }
                          onClick={() =>
                            onOptionsChange({
                              [panel.flag]:
                                !toolsVisible || !options[panel.flag],
                              telemetryEnabled: true,
                              hideAllDebugPanels: false,
                            })
                          }
                        />
                      </Tooltip>
                    ))}
                </span>
              </fieldset>
              <span role="separator" aria-orientation="vertical" />
              <Button
                type={paused ? "primary" : "text"}
                icon={<FontAwesomeIcon icon={paused ? faPlay : faPause} />}
                aria-label={paused ? "Resume scene" : "Pause scene"}
                aria-pressed={!!paused}
                title="Pause / resume shared scene rendering and tile loading"
                onClick={() => onPausedChange(!paused)}
              />
            </div>
          }
        </>
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
        {panels.map((panel) => {
          const external = externalPanels[panel.id] === true;
          const isLegend = panel.id === "legend";
          const canvasPanel =
            panel.id === "overview" ||
            panel.id === "charts" ||
            panel.id === "log";
          const formPanel =
            panel.id === "mesh-style" ||
            panel.id === "overview-options" ||
            panel.id === "diagnostic-tools";
          const panelTop = Math.min(
            panelPositions[panel.id]?.top ??
              (isLegend ? window.innerHeight - 44 : panel.top),
            Math.max(48, window.innerHeight - (isLegend ? 44 : 130))
          );
          const visible =
            toolsVisible &&
            (panel.id === "overview"
              ? overviewMode !== "off" &&
                (overviewMode === "window" || external)
              : options[panel.flag]);
          const dock = () =>
            setExternalPanels((current) => ({ ...current, [panel.id]: false }));
          const close = () => {
            dock();
            if (panel.id === "overview") setOverviewMode("off");
            else onOptionsChange({ [panel.flag]: false });
          };
          const windowControls = (
            <DiagnosticWindowActions
              label={panel.label}
              external={external}
              onClose={close}
              onToggleExternal={(event) => {
                // Measure once on undock, never from the map/render loop.
                const body = event.currentTarget
                  .closest("section")
                  ?.querySelector<HTMLElement>(
                    "[data-test-id^='mesh-coverage-panel-body-']"
                  );
                if (body)
                  externalSizes.current[panel.id] = {
                    width: body.clientWidth,
                    height: body.clientHeight,
                  };
                setExternalPanels((current) => ({
                  ...current,
                  [panel.id]: !external,
                }));
              }}
            >
              {isLegend && !external && (
                <Button
                  type="text"
                  icon={
                    <FontAwesomeIcon
                      icon={legendExpanded ? faChevronDown : faChevronUp}
                    />
                  }
                  aria-label={
                    legendExpanded ? "Collapse legend" : "Expand legend"
                  }
                  aria-expanded={legendExpanded}
                  onClick={() => setLegendExpanded((expanded) => !expanded)}
                />
              )}
              {(panel.id === "overview-options" || panel.id === "overview") && (
                <>
                  <Button
                    type="text"
                    icon={<FontAwesomeIcon icon={faCrosshairs} />}
                    aria-label="Follow viewport"
                    aria-pressed={options.overviewView === "frustum"}
                    title={
                      options.overviewView === "frustum"
                        ? "Following viewport · click for full extent"
                        : "Follow viewport"
                    }
                    onClick={() =>
                      onOptionsChange({
                        overviewView:
                          options.overviewView === "frustum"
                            ? "extent"
                            : "frustum",
                      })
                    }
                  />
                  {(overviewMode === "window" || overviewIsExternal) && (
                    <Button
                      type="text"
                      icon={<FontAwesomeIcon icon={faHand} />}
                      aria-label="Free pan/zoom"
                      aria-pressed={options.overviewView === "free"}
                      title="Free pan/zoom · window only"
                      onClick={() =>
                        onOptionsChange({
                          overviewView:
                            options.overviewView === "free" ? "extent" : "free",
                        })
                      }
                    />
                  )}
                </>
              )}
              {panel.id === "overview" && (
                <Button
                  className="tile-debug-header-toggle"
                  type="text"
                  aria-label="Tile sizes in 10 kB steps"
                  aria-pressed={options.overviewSize !== false}
                  title="Square resident-size grid and labels in 10 kB steps"
                  onClick={() =>
                    onOptionsChange({
                      overviewSize: options.overviewSize === false,
                      overlayLabels:
                        options.overviewSize === false ? "id and stats" : "id",
                    })
                  }
                >
                  kB
                </Button>
              )}
              {panel.id === "overview" && (
                <Button
                  className="tile-debug-header-toggle"
                  type="text"
                  aria-label="Tile processing steps"
                  aria-pressed={options.overviewSteps !== false}
                  title="Processing time pies"
                  onClick={() =>
                    onOptionsChange({
                      overviewSteps: options.overviewSteps === false,
                    })
                  }
                >
                  ms
                </Button>
              )}
              {panel.id === "overview" && (
                <Button
                  type="text"
                  icon={<FontAwesomeIcon icon={faSliders} />}
                  aria-label="Overview options"
                  aria-pressed={options.showOverviewOptions}
                  title="Overview options"
                  onClick={() => {
                    setFrontPanel("overview-options");
                    onOptionsChange({
                      showOverviewOptions: !options.showOverviewOptions,
                    });
                  }}
                />
              )}
              {(panel.id === "overview-options" || panel.id === "overview") && (
                <Button
                  className="tile-debug-header-toggle"
                  type="text"
                  icon={<FontAwesomeIcon icon={faCircleInfo} />}
                  aria-label="Show / hide overview legend"
                  aria-pressed={options.showLegend}
                  title={options.showLegend ? "Hide legend" : "Show legend"}
                  onClick={() =>
                    onOptionsChange({ showLegend: !options.showLegend })
                  }
                >
                  Legend
                </Button>
              )}
            </DiagnosticWindowActions>
          );
          return (
            <div key={panel.id}>
              <section
                className="tile-debug-panel"
                data-test-id={`mesh-coverage-panel-${panel.id}`}
                role="dialog"
                aria-label={panel.label}
                style={{
                  position: "fixed",
                  left: Math.min(
                    panelPositions[panel.id]?.left ?? panel.left,
                    Math.max(8, window.innerWidth - 240)
                  ),
                  top:
                    isLegend && !panelPositions[panel.id]
                      ? undefined
                      : panelTop,
                  bottom:
                    isLegend && !panelPositions[panel.id] ? 12 : undefined,
                  width: isLegend ? panel.width : "max-content",
                  maxWidth: "calc(100vw - 24px)",
                  zIndex: frontPanel === panel.id ? 12 : 10,
                  display: visible && !external ? "block" : "none",
                }}
                onPointerDown={() => setFrontPanel(panel.id)}
              >
                <header
                  aria-label={`Drag ${panel.label}`}
                  tabIndex={0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "2px 4px 2px 8px",
                    height: 32,
                    boxSizing: "border-box",
                    background: "rgb(241 245 249 / 80%)",
                    borderBottom: "1px solid rgb(100 116 139 / 16%)",
                    cursor: "grab",
                    touchAction: "none",
                    userSelect: "none",
                    font: "600 12px system-ui",
                  }}
                  onPointerDown={(event) => {
                    if (
                      event.button !== 0 ||
                      (event.target as HTMLElement).closest("button")
                    )
                      return;
                    const element = event.currentTarget.parentElement!;
                    const rect = element.getBoundingClientRect();
                    if (isLegend) {
                      element.style.bottom = "auto";
                      element.style.top = `${rect.top}px`;
                    }
                    panelDrag.current = {
                      id: panel.id,
                      x: event.clientX,
                      y: event.clientY,
                      left: rect.left,
                      top: rect.top,
                      maxLeft: Math.max(0, window.innerWidth - rect.width),
                      maxTop: Math.max(44, window.innerHeight - 36),
                      dx: 0,
                      dy: 0,
                      element,
                    };
                    element.style.willChange = "transform";
                    event.currentTarget.setPointerCapture(event.pointerId);
                    event.preventDefault();
                  }}
                  onPointerMove={(event) => {
                    const drag = panelDrag.current;
                    if (!drag || drag.id !== panel.id) return;
                    // Compositor-only movement, with bounds measured once at
                    // pointerdown. No layout read or React render per move.
                    drag.dx =
                      THREE.MathUtils.clamp(
                        drag.left + event.clientX - drag.x,
                        0,
                        drag.maxLeft
                      ) - drag.left;
                    drag.dy =
                      THREE.MathUtils.clamp(
                        drag.top + event.clientY - drag.y,
                        44,
                        drag.maxTop
                      ) - drag.top;
                    drag.element.style.transform = `translate3d(${drag.dx}px, ${drag.dy}px, 0)`;
                  }}
                  onLostPointerCapture={() => {
                    const drag = panelDrag.current;
                    if (!drag) return;
                    const left = drag.left + drag.dx;
                    const top = drag.top + drag.dy;
                    drag.element.style.transform = "";
                    drag.element.style.willChange = "";
                    drag.element.style.left = `${left}px`;
                    drag.element.style.top = `${top}px`;
                    setPanelPositions((current) => ({
                      ...current,
                      [drag.id]: {
                        left,
                        top,
                      },
                    }));
                    panelDrag.current = null;
                  }}
                  onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(
                        event.pointerId
                      );
                  }}
                  onKeyDown={(event) => {
                    if (
                      ![
                        "ArrowLeft",
                        "ArrowRight",
                        "ArrowUp",
                        "ArrowDown",
                      ].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const rect =
                      event.currentTarget.parentElement!.getBoundingClientRect();
                    setPanelPositions((current) => ({
                      ...current,
                      [panel.id]: {
                        left: Math.max(
                          0,
                          rect.left +
                            (event.key === "ArrowLeft"
                              ? -10
                              : event.key === "ArrowRight"
                              ? 10
                              : 0)
                        ),
                        top: Math.max(
                          44,
                          rect.top +
                            (event.key === "ArrowUp"
                              ? -10
                              : event.key === "ArrowDown"
                              ? 10
                              : 0)
                        ),
                      },
                    }));
                  }}
                >
                  <FontAwesomeIcon
                    icon={faGripVertical}
                    style={{ color: "#82909e" }}
                  />
                  <FontAwesomeIcon icon={panel.icon} />
                  <span style={{ flex: 1 }}>
                    {panel.id === "overview-options"
                      ? "Overview"
                      : panel.id === "overview"
                      ? "Kacheln"
                      : panel.label}
                    {panel.id === "overview" && summary && (
                      <span
                        style={{
                          fontWeight: 400,
                          color: "#64748b",
                          marginLeft: 6,
                        }}
                      >
                        Aktiv {summary.displayed} · Laden {summary.pending} ·
                        Cache {summary.resident}
                      </span>
                    )}
                  </span>
                  {windowControls}
                </header>
                <div
                  data-test-id={`mesh-coverage-panel-body-${panel.id}`}
                  style={{
                    position: isLegend ? "absolute" : "relative",
                    bottom: isLegend ? "100%" : undefined,
                    display: isLegend && !legendExpanded ? "none" : undefined,
                    width: formPanel ? 304 : panel.width,
                    height: canvasPanel ? panel.height : "auto",
                    minWidth: 220,
                    minHeight: canvasPanel ? 100 : undefined,
                    maxWidth: "calc(100vw - 32px)",
                    maxHeight: isLegend
                      ? `min(calc(100vh - 88px), ${Math.max(
                          0,
                          panelTop - 12
                        )}px)`
                      : panel.id === "queue"
                      ? Math.min(
                          panel.height,
                          window.innerHeight - panelTop - 44
                        )
                      : `calc(100vh - ${panelTop + 44}px)`,
                    overflow: "auto",
                    resize: panel.resize,
                    padding:
                      panel.id === "stats" || panel.id === "queue" ? 12 : 0,
                    boxSizing: "border-box",
                    background:
                      panel.id === "overview" && overviewMode === "window"
                        ? "rgb(38 46 56 / 94%)"
                        : undefined,
                  }}
                >
                  {visible &&
                    !external &&
                    (!isLegend || legendExpanded) &&
                    panel.content()}
                </div>
              </section>
              <Popout
                open={visible === true && external === true}
                title={`Tile coverage ${panel.label}`}
                width={externalSizes.current[panel.id]?.width ?? panel.width}
                height={externalSizes.current[panel.id]?.height ?? panel.height}
                onClose={dock}
              >
                <div
                  className="tile-debug-panel"
                  style={{
                    position: "relative",
                    height: "100%",
                  }}
                >
                  <div
                    role="group"
                    aria-label={`${panel.label} window controls`}
                    style={{
                      position: "absolute",
                      top: 0,
                      right: 0,
                      zIndex: 2,
                      background: "rgb(248 250 252 / 94%)",
                    }}
                  >
                    {windowControls}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: "100%",
                      overflow: "auto",
                      padding:
                        panel.id === "stats" || panel.id === "queue" ? 12 : 0,
                      paddingTop:
                        panel.id === "overview-options" ||
                        panel.id === "diagnostic-tools"
                          ? 28
                          : undefined,
                      boxSizing: "border-box",
                    }}
                  >
                    {panel.id === "overview"
                      ? renderOverview(true)
                      : panel.content()}
                  </div>
                </div>
              </Popout>
            </div>
          );
        })}
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
