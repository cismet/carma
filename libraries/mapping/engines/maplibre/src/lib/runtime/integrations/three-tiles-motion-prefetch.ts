import { Box3, Matrix4 } from "three";
import {
  createTileCameraDemand,
  TILE_CAMERA_PRIORITY,
  type TileCameraSnapshot,
} from "../../core/tile-camera-demand";
import { createTileMotionPrediction } from "../../core/tile-motion-prediction";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  initialMeshLoadError,
  isExtentFloorTile,
} from "../../core/mesh-error-policy";
import type {
  ThreeTilesRuntimeState,
  ThreeTilesRuntimeServices,
} from "./three-tiles-runtime-context";
import type { RuntimeLruCache, RuntimeTile } from "./three-tiles-runtime-types";
import {
  LOADED_LOADING_STATE,
  UNLOADED_LOADING_STATE,
} from "./three-tiles-runtime-vendor";

type State = Pick<
  ThreeTilesRuntimeState,
  | "tiles"
  | "map"
  | "options"
  | "requestedErrorTarget"
  | "memoryErrorTarget"
  | "meshBaseCoverageReady"
  | "shadowView"
  | "memoryAdmissionPaused"
  | "loadingPaused"
  | "runtimeVisible"
  | "deferred"
  | "extentFloorArmed"
  | "extentGeometricError"
  | "meshRefinementSupport"
  | "residentAncestors"
>;

/** Optional requests share native queues, cancellation and residency. No forecast
 * is registered as a receiver or allowed to change the published tree cut.
 * Decision: PAN-PREDICTION-20260916 in TILES_COVERAGE.md.
 */
export function createThreeTilesMotionPrefetch(
  state: State,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    "getTileCameraDemand" | "getTileRequestPriority" | "applyTileDeferral"
  >
) {
  const prediction = createTileMotionPrediction();
  const external = new Map<
    string,
    { view: TileCameraSnapshot; expires: number }
  >();
  const pending = new Map<RuntimeTile, object>();
  const retryAfter = new WeakMap<RuntimeTile, number>();
  const bounds = new Box3(),
    transform = new Matrix4();
  let demand = createTileCameraDemand([]);
  let automatic: TileCameraSnapshot | null = null;
  let lastSample = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let requested = 0,
    completed = 0,
    cancelled = 0;
  const initialError = () =>
    initialMeshLoadError(
      Math.max(state.requestedErrorTarget, state.memoryErrorTarget),
      state.options.baseErrorTargetPixels
    );
  const evaluate = (tile: RuntimeTile) => {
    if (!state.tiles || !tile.engineData?.boundingVolume) return null;
    readOrientedTileBounds(tile.engineData.boundingVolume, bounds, transform);
    transform.premultiply(state.tiles.group.matrixWorld);
    bounds.applyMatrix4(transform);
    return demand.evaluate(bounds, tile.geometricError);
  };
  const needed = (tile: RuntimeTile) => {
    // Current demand adopts the very same promise and payload when it arrives.
    if (
      dependencies.getTileCameraDemand(tile, true).required ||
      state.meshRefinementSupport?.has(tile) ||
      state.residentAncestors?.has(tile) ||
      (state.extentFloorArmed &&
        isExtentFloorTile(tile, state.extentGeometricError))
    )
      return true;
    let candidate: RuntimeTile = tile;
    // Immediate siblings complete one REPLACE family, but never recursively
    // refine offscreen children merely because one sibling intersects the lead.
    if (tile.parent?.refine === "REPLACE")
      candidate = tile.parent as RuntimeTile;
    const match = evaluate(candidate);
    return !!match?.required && (candidate === tile || match.errorRatio > 1);
  };
  const cancelObsolete = () => {
    for (const tile of pending.keys())
      if (!needed(tile)) {
        // A completed request is resident coverage now, not cancellable work.
        // Promise cleanup can lag a camera/expiry event by a microtask.
        if (tile.internal.loadingState !== LOADED_LOADING_STATE) {
          cancelled++;
          state.tiles?.lruCache.remove(tile);
        }
        pending.delete(tile);
        tile.motionPrefetch = false;
      }
  };
  const refreshDemand = () => {
    const now = performance.now();
    for (const [id, item] of external)
      if (item.expires <= now) external.delete(id);
    const views = [
      ...(automatic ? [automatic] : []),
      ...[...external.values()].map((v) => v.view),
    ];
    demand = createTileCameraDemand(
      views.map((v, index) => ({
        ...v,
        id: `prediction:${index}:${v.id}`,
        errorTargetPixels: Math.max(v.errorTargetPixels, initialError()),
      }))
    );
    cancelObsolete();
    if (expiryTimer !== null) clearTimeout(expiryTimer);
    expiryTimer = external.size
      ? setTimeout(() => {
          expiryTimer = null;
          refreshDemand();
        }, Math.max(1, Math.min(...[...external.values()].map((v) => v.expires)) - now))
      : null;
  };
  const run = () => {
    timer = null;
    const tiles = state.tiles;
    if (
      disposed ||
      !tiles?.root ||
      !state.options.providesTerrain ||
      state.memoryAdmissionPaused ||
      state.loadingPaused ||
      state.runtimeVisible === false ||
      state.shadowView ||
      !state.meshBaseCoverageReady ||
      !demand.views.length ||
      (tiles.lruCache as RuntimeLruCache).cachedBytes >=
        tiles.lruCache.minBytesSize * 0.85 ||
      tiles.downloadQueue.maxJobsPerOrigin <= 0 ||
      tiles.parseQueue.maxJobs <= 0
    )
      return;
    const stack = [tiles.root as RuntimeTile];
    let visited = 0;
    while (stack.length && visited++ < 256 && pending.size < 4) {
      const tile = stack.pop()!;
      const match = evaluate(tile);
      if (!tile.internal || !match?.required) continue;
      const payload = tile.internal.hasRenderableContent;
      if (
        (payload && (match.errorRatio <= 1 || tile.children.length === 0)) ||
        (tile.internal.hasUnrenderableContent &&
          tile.internal.loadingState !== LOADED_LOADING_STATE)
      ) {
        if (dependencies.getTileCameraDemand(tile, true).required) continue;
        const family =
          payload && tile.parent?.refine === "REPLACE"
            ? (tile.parent.children as RuntimeTile[])
            : [tile];
        const missing = family.filter(
          (child) =>
            child.internal?.hasContent &&
            (child.internal.loadingState === UNLOADED_LOADING_STATE ||
              state.deferred?.has(child))
        );
        // Preemption is expected, not permission to repeatedly restart the same
        // fetch on every motion sample. This affects only optional admission.
        if (
          missing.some(
            (child) => (retryAfter.get(child) ?? 0) > performance.now()
          )
        )
          continue;
        if (missing.length + pending.size > 4) continue;
        for (const child of missing) {
          const token = {};
          pending.set(child, token);
          child.motionPrefetch = true;
          dependencies.applyTileDeferral(child, true);
          child.cameraPriority = TILE_CAMERA_PRIORITY.PREFETCH;
          requested++;
          child.firstPublicationRequestedAt = performance.now();
          void tiles
            .requestTileContents(child)
            .then(() => {
              if (
                pending.get(child) === token &&
                child.internal.loadingState === LOADED_LOADING_STATE
              )
                completed++;
            })
            .catch(() => {
              /* Cancellation/network retry remains vendor owned. */
            })
            .finally(() => {
              if (pending.get(child) === token) {
                if (child.internal.loadingState !== LOADED_LOADING_STATE) {
                  cancelled++;
                  retryAfter.set(child, performance.now() + 2000);
                }
                pending.delete(child);
                child.motionPrefetch = false;
              }
              // Native load/needs-update events wake the scene. Cancellation
              // has no new image and must not sustain a render/retry loop.
            });
          tiles.markTileUsed(child);
        }
        continue;
      }
      tiles.ensureChildrenArePreprocessed(tile, false);
      for (const child of tile.children ?? [])
        if (child.internal) stack.push(child as RuntimeTile);
    }
  };
  return {
    needed,
    observeLatency: prediction.observeLatency,
    clear() {
      external.clear();
      automatic = null;
      prediction.reset();
      refreshDemand();
    },
    setView(view: TileCameraSnapshot | null, id: string, validForMs = 250) {
      if (disposed) return;
      if (!Number.isFinite(validForMs) || validForMs <= 0 || validForMs > 2000)
        throw new Error("Prediction validity must be in (0, 2000] ms");
      if (view && !external.has(id) && external.size >= 3)
        throw new Error("At most three future camera views per runtime");
      if (view)
        external.set(id, { view, expires: performance.now() + validForMs });
      else external.delete(id);
      refreshDemand();
      if (timer === null && demand.views.length && state.meshBaseCoverageReady)
        timer = setTimeout(run, 0);
    },
    update(view: TileCameraSnapshot, widthMeters: number) {
      if (disposed) return;
      const now = performance.now();
      const moving = state.map?.isMoving?.() === true;
      const zooming = state.map?.isZooming?.() === true;
      if (now - lastSample < 100 && moving && !zooming) return;
      // Idle rendering must not turn prediction into a persistent polling loop.
      if (now - lastSample < 100 && !automatic && external.size === 0) return;
      lastSample = now;
      automatic = prediction.update(view, now, moving, zooming, widthMeters);
      refreshDemand();
      if (timer === null && demand.views.length && state.meshBaseCoverageReady)
        timer = setTimeout(run, 0);
    },
    getStats: () => ({
      ...prediction.getStats(),
      requested,
      completed,
      cancelled,
      pending: pending.size,
      views: demand.views.length,
    }),
    dispose() {
      disposed = true;
      if (timer !== null) clearTimeout(timer);
      if (expiryTimer !== null) clearTimeout(expiryTimer);
      external.clear();
      automatic = null;
      demand = createTileCameraDemand([]);
      cancelObsolete();
      prediction.reset();
    },
  };
}
