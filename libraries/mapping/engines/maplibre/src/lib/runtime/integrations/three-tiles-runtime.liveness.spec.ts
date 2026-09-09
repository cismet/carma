// @vitest-environment jsdom

/**
 * D8/D9 liveness of the 3D Tiles runtime: a failed tile leaves the cache and
 * is requested again after its backoff, a disposed model wakes the traversal,
 * the kickstart stops once the root tileset arrived, the hidden-tab wipe is
 * debounced, the debug overlay only exists while bounds are shown, and a
 * disposed runtime reports no demand.
 */

import { TilesRenderer } from "3d-tiles-renderer";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import { HIDDEN_TAB_WIPE_DELAY_MS } from "./three-tiles-runtime-config";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

type LivenessRenderer = TilesRenderer & {
  requestTileContents: (tile: unknown) => unknown;
  queueTileForDownload: (tile: unknown) => void;
  queuedTiles: unknown[];
  loadingTiles: Set<unknown>;
  stats: {
    queued: number;
    downloading: number;
    parsing: number;
    failed: number;
  };
};

const buildTile = (uri: string, scene: THREE.Object3D | null = null) => ({
  content: { uri },
  geometricError: 1,
  internal: {
    basePath: "https://example.test/tiles",
    loadingState: 0,
    depth: 3,
    hasContent: true,
    hasRenderableContent: true,
  },
  traversal: { inFrustum: true, visible: false, active: false },
  engineData: { scene, geometry: [], materials: [], textures: [] },
  children: [],
});

const buildMap = () =>
  ({
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
  } as unknown as MaplibreMap);

/** Event types seen by a `dispatchEvent` spy (three stamps `target` onto events). */
const dispatchedTypes = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map(([event]) => (event as { type: string }).type);

const mountRuntime = (providesTerrain = false) => {
  let renderer: LivenessRenderer | undefined;
  vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function (
    this: TilesRenderer
  ) {
    renderer = this as LivenessRenderer;
  });
  const map = buildMap();
  const repaint = map.triggerRepaint as unknown as ReturnType<typeof vi.fn>;
  const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25], {
    providesTerrain,
  });
  if (providesTerrain) layer.loading.setErrorTarget(1);
  const camera = new THREE.PerspectiveCamera();
  const frame = {
    map,
    renderCamera: camera,
    lodCamera: camera,
    lookTarget: new THREE.Vector3(),
    viewport: new THREE.Vector2(800, 600),
  };
  layer.scene.onAdd?.(map);
  layer.scene.update(frame);
  return { layer, map, repaint, frame, renderer: renderer as LivenessRenderer };
};

describe("three tiles runtime liveness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("fetch", () => new Promise(() => undefined));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not let loose external metadata keep offscreen mesh demand alive", () => {
    const { layer, renderer, frame } = mountRuntime(true);
    const parent = buildTile("coarse.b3dm", new THREE.Group());
    const metadata = buildTile("children.json");
    const child = buildTile("outside.b3dm");
    for (const tile of [parent, metadata, child]) {
      Object.assign(tile.engineData, {
        // Main-view membership now uses the native bound/frustum predicate,
        // not calculateTileViewError (which also includes shadow cameras).
        boundingVolume: {
          distanceToPoint: () => 1,
          intersectsFrustum: () => tile !== child,
        },
      });
      Object.assign(tile.traversal, { error: 300 });
    }
    parent.internal.loadingState = 4;
    Object.assign(metadata.internal, {
      loadingState: 4,
      hasRenderableContent: false,
      hasUnrenderableContent: true,
    });
    Object.assign(parent, { children: [metadata] });
    Object.assign(metadata, { children: [child] });
    const error = vi
      .spyOn(renderer, "calculateTileViewError")
      .mockImplementation((tile, target) => {
        Object.assign(target, {
          inView: tile !== child,
          error: 300,
          distanceFromCamera: 1,
        });
      });
    renderer.visibleTiles.add(parent as never);
    layer.scene.update(frame);
    expect(layer.scene.isMainViewReady?.()).toBe(true);
    const calls = error.mock.calls.length;
    expect(layer.scene.isMainViewReady?.()).toBe(true);
    expect(error.mock.calls.length).toBe(calls);
    // Missing descendant bounds must remain unresolved, never false coverage.
    Object.assign(child.engineData, { boundingVolume: undefined });
    renderer.dispatchEvent({
      type: "load-tileset",
      url: "children.json",
    } as never);
    layer.scene.update(frame);
    expect(layer.scene.isMainViewReady?.()).toBe(false);
    layer.scene.dispose();
  });

  it("admits a ready mesh branch immediately without a view-wide stage or audit timer", () => {
    const { layer, renderer } = mountRuntime(true);
    const parent = {
      ...buildTile("coarse.b3dm", new THREE.Group()),
      refine: "REPLACE",
      parent: null,
    };
    parent.internal.loadingState = 4;
    Object.assign(parent.traversal, { error: 8 });
    const child = { ...buildTile("local-next.b3dm"), parent };
    const grandchild = { ...buildTile("local-final.b3dm"), parent: child };
    Object.assign(child, { refine: "REPLACE" });
    Object.assign(child.traversal, { error: 4 });
    renderer.queueTileForDownload(child);
    renderer.queueTileForDownload(child);
    expect(renderer.queuedTiles).toEqual([child]);
    renderer.queueTileForDownload(grandchild);
    expect(renderer.queuedTiles).toEqual([child]);
    child.internal.loadingState = 4;
    renderer.queueTileForDownload(grandchild);
    expect(renderer.queuedTiles).toEqual([child, grandchild]);
    layer.scene.dispose();
  });

  it("throttles mesh coverage during input and traverses immediately after movement", () => {
    const { layer, map, frame, renderer } = mountRuntime(true);
    let moving = true;
    Object.assign(map, { isMoving: () => moving });
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const update = vi.mocked(renderer.update);
    update.mockClear();
    layer.scene.update(frame);
    now = 50;
    layer.scene.update(frame);
    now = 120;
    layer.scene.update(frame);
    expect(update).toHaveBeenCalledTimes(2);
    moving = false;
    layer.scene.update(frame);
    expect(update).toHaveBeenCalledTimes(3);
    layer.scene.dispose();
  });

  it("removes a failed tile from the cache and requests it again after the backoff", () => {
    const { layer, renderer } = mountRuntime();
    // Content exists, so the demand below only reflects the retry state.
    renderer.group.add(new THREE.Group());
    const tile = buildTile("child.b3dm");
    expect(layer.loading.getRequestDemand()).toBe(0);

    // first request: enters the cache and the download queue
    renderer.requestTileContents(tile);
    expect(tile.internal.loadingState).toBe(1);
    expect(renderer.lruCache.has(tile as never)).toBe(true);
    expect(renderer.downloadQueue.has(tile)).toBe(true);

    // upstream's failure bookkeeping: state FAILED, tile stays cached
    renderer.downloadQueue.remove(tile);
    renderer.loadingTiles.delete(tile);
    tile.internal.loadingState = -1;
    renderer.stats.queued = 0;
    renderer.stats.failed = 1;
    renderer.lruCache.setLoaded(tile as never, true);
    renderer.dispatchEvent({
      type: "load-error",
      tile: tile as never,
      error: new Error("status 503"),
      url: "https://example.test/tiles/child.b3dm",
    } as never);

    // The tile left the cache, is UNLOADED and skipped while the retry is
    // pending, so the parent keeps rendering as the fallback.
    expect(renderer.lruCache.has(tile as never)).toBe(false);
    expect(tile.internal.loadingState).toBe(0);
    expect(renderer.stats.failed).toBe(0);
    renderer.queueTileForDownload(tile);
    expect(renderer.queuedTiles).toHaveLength(0);
    // Only the required retry blocks a settled scene. Policy cooldowns and
    // adaptive-error timers do not represent missing tile content.
    expect(layer.loading.getRequestDemand()).toBe(1);

    const dispatchSpy = vi.spyOn(renderer, "dispatchEvent");
    vi.advanceTimersByTime(2_000);
    expect(dispatchedTypes(dispatchSpy)).toContain("needs-update");
    expect(layer.loading.getRequestDemand()).toBe(0);

    // the next traversal can request it again
    renderer.queueTileForDownload(tile);
    expect(renderer.queuedTiles).toHaveLength(1);
    renderer.queuedTiles.length = 0;
    renderer.requestTileContents(tile);
    expect(tile.internal.loadingState).toBe(1);
    expect(renderer.lruCache.has(tile as never)).toBe(true);
    expect(renderer.downloadQueue.has(tile)).toBe(true);

    layer.scene.dispose();
  });

  it("asks for a traversal when a disposed model frees cache space", () => {
    const { layer, repaint, renderer } = mountRuntime();
    const dispatchSpy = vi.spyOn(renderer, "dispatchEvent");
    const tile = buildTile("leaf.b3dm", new THREE.Group());
    renderer.requestTileContents(tile);
    repaint.mockClear();
    dispatchSpy.mockClear();

    // eviction and the discard path only run lruCache.remove -> dispose-model
    renderer.lruCache.remove(tile as never);

    expect(dispatchedTypes(dispatchSpy)).toEqual([
      "dispose-model",
      "needs-update",
    ]);
    expect(repaint).toHaveBeenCalled();
    layer.scene.dispose();
  });

  it("stops kickstarting frames once the root tileset arrived", () => {
    const { layer, repaint, renderer } = mountRuntime();
    // No debug helper groups: the tiles group is empty until content loads.
    expect(renderer.group.children).toHaveLength(0);

    repaint.mockClear();
    vi.advanceTimersByTime(800);
    expect(repaint).toHaveBeenCalledTimes(2);

    renderer.dispatchEvent({
      type: "load-tileset",
      url: "tileset.json",
    } as never);
    repaint.mockClear();
    vi.advanceTimersByTime(4_000);
    expect(repaint).not.toHaveBeenCalled();
    layer.scene.dispose();
  });

  it("keeps kickstarting after a tile error but not while hidden", () => {
    const { layer, repaint, renderer } = mountRuntime();
    renderer.dispatchEvent({
      type: "load-error",
      tile: buildTile("child.b3dm") as never,
      error: new Error("status 404"),
      url: "https://example.test/tiles/child.b3dm",
    } as never);
    repaint.mockClear();
    vi.advanceTimersByTime(800);
    expect(repaint).toHaveBeenCalledTimes(2);

    layer.appearance.setVisible(false);
    repaint.mockClear();
    vi.advanceTimersByTime(2_000);
    expect(repaint).not.toHaveBeenCalled();
    layer.appearance.setVisible(true);
    repaint.mockClear();
    vi.advanceTimersByTime(800);
    expect(repaint).toHaveBeenCalledTimes(2);
    layer.scene.dispose();
  });

  it("evicts unused tiles at once when hidden and wipes the rest after the delay", () => {
    const { layer, renderer } = mountRuntime();
    const cache = renderer.lruCache as TilesRenderer["lruCache"] & {
      usedSet: Set<unknown>;
    };
    const usedTile = buildTile("used.b3dm");
    const unusedTile = buildTile("unused.b3dm");
    const disposeUsed = vi.fn();
    const disposeUnused = vi.fn();
    cache.add(usedTile as never, disposeUsed);
    cache.add(unusedTile as never, disposeUnused);
    cache.markUnused(unusedTile as never);
    expect(cache.usedSet.has(usedTile)).toBe(true);

    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(disposeUnused).toHaveBeenCalledOnce();
    expect(disposeUsed).not.toHaveBeenCalled();

    // Returning before the delay cancels the full wipe.
    vi.advanceTimersByTime(HIDDEN_TAB_WIPE_DELAY_MS - 1);
    visibilitySpy.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(HIDDEN_TAB_WIPE_DELAY_MS);
    expect(disposeUsed).not.toHaveBeenCalled();

    visibilitySpy.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(HIDDEN_TAB_WIPE_DELAY_MS);
    expect(disposeUsed).toHaveBeenCalledOnce();
    expect(cache.has(usedTile as never)).toBe(false);

    visibilitySpy.mockRestore();
    layer.scene.dispose();
  });

  it("attaches the tile edge and label overlay only while enabled", () => {
    const { layer, renderer } = mountRuntime();
    const findOverlay = () =>
      renderer.group.getObjectByName("CARMA 3D tiles bounds and labels");
    expect(findOverlay()).toBeUndefined();

    layer.debug.setTileBoundsVisible(true);
    expect(findOverlay()).toBeDefined();

    layer.debug.setTileBoundsVisible(false);
    expect(findOverlay()).toBeUndefined();
    expect(renderer.group.children).toHaveLength(0);
    layer.scene.dispose();
  });

  it("keeps rendering for queued downloads only while downloads may run", () => {
    const { layer, repaint, frame, renderer } = mountRuntime();
    renderer.stats.queued = 1;

    layer.loading.setRequestConcurrency(0);
    repaint.mockClear();
    layer.scene.update(frame);
    expect(repaint).not.toHaveBeenCalled();

    layer.loading.setRequestConcurrency(8);
    repaint.mockClear();
    layer.scene.update(frame);
    expect(repaint).toHaveBeenCalled();
    layer.scene.dispose();
  });

  it("reports no request demand after dispose", () => {
    const { layer } = mountRuntime();
    expect(layer.loading.getRequestDemand()).toBeGreaterThan(0);
    layer.scene.dispose();
    expect(layer.loading.getRequestDemand()).toBe(0);
  });
});
