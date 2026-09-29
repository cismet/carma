import {
  startTransition,
  useEffect,
  type MutableRefObject,
  type RefObject,
} from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";
import {
  CSS2DObject,
  CSS2DRenderer,
} from "three/addons/renderers/CSS2DRenderer.js";
import type { MetricRecorder, StripChart } from "@carma-commons/ui/components";
import {
  MAPLIBRE_EVENT,
  acquireSharedThreeScene,
  registerSharedThreeSceneRuntime,
  type DiagnosticRuntimeTile as RuntimeTile,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
  type ThreeTilesRuntime,
  type TileCameraSnapshot,
  type TileDiagnosticKind as Kind,
  type TileDiagnosticModel as OverlayModel,
  type TileDiagnosticQueueRow as QueueRow,
  type TileDiagnosticSummary as CoverageSummary,
  type TileDiagnostics,
  type TilesRuntimeDebugState,
} from "@carma-mapping/engines/maplibre";
import {
  SHADOW_CORRIDOR_CAMERA_ID,
  snapshotShadowCorridorCameras,
} from "./shadow-corridor-camera";
import type { ResolvedDebugOptions } from "./tile-loading-debug-options";

const SAMPLE_INTERVAL_MS = 500;
// Scene capture can be slower than presentation; the worker reuses GPU geometry
// while camera matrices reach the overview worker directly on every scene frame.
const OVERLAY_INTERVAL_MS = 100;
const IDLE_TIMEOUT_MS = 300;

export const readRuntime = (runtime: ThreeTilesRuntime) =>
  runtime.debug.readState();

export const EMPTY_MODEL: OverlayModel = {
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
    lines.push(
      next.ready ? "observer coverage ready" : "observer coverage pending"
    );
  if (previous.waitingForBase !== next.waitingForBase)
    lines.push(
      next.waitingForBase
        ? "waiting for whole-base pan reserve"
        : next.closureCoverage.ready
        ? "whole-base pan reserve ready"
        : "whole-base pan reserve inactive"
    );
  if (
    previous.floorLoaded !== next.floorLoaded ||
    previous.floorTotal !== next.floorTotal
  )
    lines.push(`floor ${next.floorLoaded}/${next.floorTotal} loaded`);
  if (previous.uncovered !== next.uncovered)
    lines.push(
      next.uncovered > 0
        ? `WARNING ${next.uncovered} floor tiles without a loaded cut`
        : "no uncovered known floor branches"
    );
  if (previous.pending !== next.pending && next.pending > 0)
    lines.push(`${next.pending} floor tiles pending`);
  if (previous.displayed !== next.displayed)
    lines.push(
      `displayed ${next.displayed} (${
        next.displayed - previous.displayed >= 0 ? "+" : ""
      }${next.displayed - previous.displayed})`
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

type Hover = { tile: Tile; parent: Tile | null; siblings: Tile[] } | null;

type RuntimeBindings = {
  map: MapLibreMap;
  recorder: MetricRecorder;
  runtimeHandle: ThreeTilesRuntime;
  options: ResolvedDebugOptions;
  optionsRef: MutableRefObject<ResolvedDebugOptions>;
  cameraIdsKey: MutableRefObject<string>;
  cameraListeners: MutableRefObject<
    Set<(camera: THREE.Camera, cameras: readonly TileCameraSnapshot[]) => void>
  >;
  liveCamera: MutableRefObject<THREE.Camera | null>;
  liveSecondaryCameras: MutableRefObject<readonly TileCameraSnapshot[]>;
  latest: MutableRefObject<Record<string, number>>;
  hoverRef: MutableRefObject<Hover>;
  queueHistory: MutableRefObject<Map<Tile, QueueRow>>;
  chartRef: MutableRefObject<StripChart | null>;
  statusRef: RefObject<HTMLOutputElement>;
  setCameraIds: (ids: string[]) => void;
  setHover: (tile: Tile | null) => void;
  setModel: (model: OverlayModel) => void;
  setQueue: (rows: QueueRow[]) => void;
  setRuntimeReady: (ready: boolean) => void;
  setSummary: (summary: CoverageSummary | null) => void;
};

export const useTileLoadingDebugRuntime = (
  diagnostics: TileDiagnostics,
  {
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
  }: RuntimeBindings
) => {
  const {
    createTileDiagnosticScene,
    tileWorldBox,
    loadingTilesOf,
    tileId,
    captureTileDiagnostics,
    summarizeTileDiagnostics,
    updateTileDiagnosticQueue,
    createTilePipelineTelemetry,
  } = diagnostics;

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
    const pipeline = createTilePipelineTelemetry(() =>
      readRuntime(runtimeHandle)
    );
    // Pipeline sampling must not wait for an overview worker capture to finish.
    const samplePipeline = () => {
      if (disposed) return;
      const coverage = runtimeHandle.loading.getCoverageStatus();
      const values = {
        ...pipeline.sample(),
        baseKnown: coverage.baseCoverage.known,
        baseDemanded: coverage.baseCoverage.demanded,
        baseResident: coverage.baseCoverage.resident,
        baseRenderable: coverage.baseCoverage.renderable,
        baseCovered: coverage.baseCoverage.covered,
        baseCoveragePct:
          coverage.baseCoverage.ratio === null
            ? Number.NaN
            : 100 * coverage.baseCoverage.ratio,
        closureKnown: coverage.closureCoverage.known,
        closureCovered: coverage.closureCoverage.covered,
        closureCoveragePct:
          coverage.closureCoverage.ratio === null
            ? Number.NaN
            : 100 * coverage.closureCoverage.ratio,
        waitingForBase: Number(coverage.waitingForBase),
        seamKnown: coverage.seamCoverage.known,
        seamDemanded: coverage.seamCoverage.demanded,
        seamResident: coverage.seamCoverage.resident,
        seamRenderable: coverage.seamCoverage.renderable,
      };
      latest.current = { ...latest.current, ...values };
      recorder.sample(values);
    };
    const pipelineInterval = window.setInterval(
      samplePipeline,
      SAMPLE_INTERVAL_MS
    );
    let lastCachedBytes = 0;
    let lastPipelineSampleAt = performance.now();

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
      ].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
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
      displayed: number,
      stable?: CoverageSummary
    ) => summarizeTileDiagnostics(state, runtimeHandle, displayed, stable);
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
        ...state.deferred,
      ])) {
        pool.set(
          tile,
          (tile.internal?.loadingState ?? 0) * 16 +
            Number(state.displayedMeshFrontier.has(tile)) +
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
            lastDisplayed,
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
      const { model: nextModel, labelled, displayed } = captured;
      syncLabels(currentOptions.sceneLabels ? labelled : [], group);
      syncSceneExtents(nextModel.rects);
      syncDebugPlugin(tiles);
      setModel(nextModel);
      overlayMs = performance.now() - startedAt;
      lastDisplayed = displayed;
      if (sampleSummary) {
        lastOverlaySummary = summarize(state, displayed);
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
    let chartFrameMaxMs = 0;
    let cameraSignature: string | undefined;
    let shadowSignature: string | undefined;
    const markChart = (label: string, color: string) => {
      chartRef.current?.mark({ at: recorder.elapsed(), label, color });
    };
    const pushChart = () => {
      chartWork = null;
      if (disposed) return;
      const frameMs = chartFrameMaxMs;
      chartFrameMaxMs = 0;
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
        const sunChanged = state?.shadowViewSignature !== shadowSignature;
        if (sunChanged) {
          markChart("Sun frustum", "#a16207");
          shadowSignature = state?.shadowViewSignature;
        }
        if (state?.tileCameraSignature !== cameraSignature && !map.isMoving()) {
          if (!sunChanged) markChart("View frustum", "#0891b2");
          cameraSignature = state?.tileCameraSignature;
        }
        chart.push(
          {
            ...latest.current,
            frameMs,
            traversalMs: state?.lastTraversalMs ?? 0,
            displayed: state?.displayedMeshFrontier.size ?? 0,
            triangles: triangles / 1000,
            drawCalls,
            queued: stats?.queued ?? 0,
            downloading: stats?.downloading ?? 0,
            parsing: stats?.parsing ?? 0,
            chartMs: chart.lastPushMs(),
            target: state?.effectiveErrorTarget ?? 0,
          },
          recorder.elapsed()
        );
      }
    };
    const countFrames = () => {
      const now = performance.now();
      frames += 1;
      latestFrameMs = now - lastFrameAt;
      chartFrameMaxMs = Math.max(chartFrameMaxMs, latestFrameMs);
      frameMaxMs = Math.max(frameMaxMs, latestFrameMs);
      lastFrameAt = now;
      // Timestamped charts need no per-frame history or redraw; sample at 10 Hz.
      if (chartRef.current && !chartWork && now - lastChartAt >= 100) {
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
          const memory = (
            performance as unknown as {
              memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
            }
          ).memory;
          const heap = memory?.usedJSHeapSize;
          const sampledAt = performance.now();
          const seconds = Math.max(
            0.001,
            (sampledAt - lastPipelineSampleAt) / 1000
          );
          lastPipelineSampleAt = sampledAt;
          latest.current = {
            ...latest.current,
            overlayMs,
            displayed: next?.displayed ?? 0,
            cacheMB: next?.cachedMB ?? 0,
            cacheCeilingMB: next?.ceilingMB ?? Number.NaN,
            heapLimitMB:
              memory?.jsHeapSizeLimit !== undefined
                ? memory.jsHeapSizeLimit / 1e6
                : Number.NaN,
            pressure:
              next && next.ceilingMB > 0
                ? (100 * next.cachedMB) / next.ceilingMB
                : 0,
            heapMB: heap !== undefined ? heap / 1e6 : Number.NaN,
            textures,
          };
          recorder.sample({
            fps,
            frameMaxMs,
            longTasks,
            downloading: next?.downloading ?? 0,
            parsing: next?.parsing ?? 0,
            residentMBs: residentDelta / 1e6 / seconds,
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
    const onMoveStart = () => {
      recorder.log("move start");
      markChart("Move start", "#0284c7");
    };
    const onMoveEnd = () => {
      markChart("Move end", "#7c3aed");
      const center = map.getCenter();
      recorder.log(
        `move end: zoom ${(map.getZoom() + 1).toFixed(2)} pitch ${map
          .getPitch()
          .toFixed(0)}° fov ${map
          .getVerticalFieldOfView()
          .toFixed(0)}° at ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`
      );
    };
    map.on(MAPLIBRE_EVENT.RENDER, onRender);
    map.on(MAPLIBRE_EVENT.MOVE_START, onMoveStart);
    map.on(MAPLIBRE_EVENT.MOVE_END, onMoveEnd);
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
      map.off(MAPLIBRE_EVENT.RENDER, onRender);
      map.off(MAPLIBRE_EVENT.MOVE_START, onMoveStart);
      map.off(MAPLIBRE_EVENT.MOVE_END, onMoveEnd);
      window.clearInterval(interval);
      window.clearTimeout(overlayTimer);
      if (idleHandle !== 0) cancelIdle(idleHandle);
      cancelAnimationFrame(frameHandle);
      longTaskObserver?.disconnect();
      window.clearInterval(pipelineInterval);
      pipeline.dispose();
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
};
