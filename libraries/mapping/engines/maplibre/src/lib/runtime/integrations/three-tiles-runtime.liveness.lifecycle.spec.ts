// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import {
  DownloadPriorityQueue,
  LRUCache,
  PriorityQueue,
  type Tile,
} from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { disposeTilesRenderer } from "./three-tiles-runtime-vendor";
import type { RuntimeTilesRenderer } from "./three-tiles-runtime-types";

import { HIDDEN_TAB_WIPE_DELAY_MS } from "./three-tiles-runtime-config";
import {
  buildTile,
  mountRuntime,
} from "./three-tiles-runtime.liveness.test-support";
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

describe("lifecycle runtime integration", () => {
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
  it("mounts once at the frame's reference fit and leaves the mount alone on a refit", () => {
    const { layer, renderer, frame } = mountRuntime(false, true);
    try {
      const group = renderer.group;
      const fit = group.parent!;
      const initial = fit.matrix.clone();
      const copy = vi.spyOn(fit.matrix, "copy");
      expect(layer.scene.mountsOnLocalFrame).toBe(true);
      // A refit moves the layer's local-frame group, never the mount.
      frame.localFrame = {
        ...frame.localFrame,
        lngLat: [7.3, 51.3] as const,
        revision: frame.localFrame.revision + 1,
        referenceToCurrent: new THREE.Matrix4().makeTranslation(10, 0, 0),
        currentToReference: new THREE.Matrix4().makeTranslation(-10, 0, 0),
      };
      layer.scene.update(frame);
      expect(group.parent).toBe(fit);
      expect(fit.matrix.equals(initial)).toBe(true);
      expect(copy).not.toHaveBeenCalled();
      // A new reference fit, after a re-attach, remounts.
      frame.localFrame = {
        ...frame.localFrame,
        referenceLngLat: [7.3, 51.3] as const,
        revision: frame.localFrame.revision + 1,
      };
      layer.scene.update(frame);
      expect(fit.matrix.equals(initial)).toBe(false);
      expect(fit.matrix.elements.every(Number.isFinite)).toBe(true);
      expect(copy).toHaveBeenCalledOnce();
    } finally {
      layer.scene.dispose();
    }
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

  it("attaches the tile edge and label overlay only while enabled", async () => {
    const { layer, renderer } = mountRuntime();
    const findOverlay = () =>
      renderer.group.getObjectByName("CARMA 3D tiles bounds and labels");
    expect(findOverlay()).toBeUndefined();

    layer.debug.setTileBoundsVisible(true);
    layer.debug.setTileBoundsVisible(false);
    await vi.dynamicImportSettled();
    expect(findOverlay()).toBeUndefined();
    layer.debug.setTileBoundsVisible(true);
    expect(findOverlay()).toBeDefined();

    layer.debug.setTileBoundsVisible(false);
    expect(findOverlay()).toBeUndefined();
    expect(renderer.group.children).toHaveLength(0);
    layer.scene.dispose();
  });

  it("disposes cached descendants and pending requests without revisiting uncached hierarchy", () => {
    const renderer = new TilesRenderer() as RuntimeTilesRenderer;
    renderer.lruCache = new LRUCache();
    renderer.downloadQueue = new DownloadPriorityQueue();
    renderer.parseQueue = new PriorityQueue();
    const root = buildTile("root.json") as unknown as Tile;
    const external = buildTile("external.json") as unknown as Tile;
    const loaded = buildTile("loaded.b3dm") as unknown as Tile;
    const pending = buildTile("pending.b3dm") as unknown as Tile;
    const uncached = buildTile("uncached.b3dm") as unknown as Tile;
    root.children = [uncached, external];
    external.children = [loaded, pending];
    external.parent = uncached.parent = root;
    loaded.parent = pending.parent = external;
    let hierarchyReads = 0;
    Object.defineProperty(uncached, "children", {
      get: () => {
        hierarchyReads++;
        return [];
      },
    });
    Object.assign(renderer, { rootTileset: { root } });
    const removed: Tile[] = [];
    renderer.lruCache.add(external, () => {
      removed.push(external);
      external.children.length = 0;
    });
    const signals = new Map<string, AbortSignal>();
    vi.stubGlobal("fetch", (url: string, options: RequestInit) => {
      signals.set(url, options.signal as AbortSignal);
      return new Promise(() => undefined);
    });
    void renderer.requestTileContents(loaded);
    void renderer.requestTileContents(pending);
    for (const queue of renderer.downloadQueue.originQueues.values())
      queue.tryRunJobs();
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshBasicMaterial();
    const geometryDisposed = vi.spyOn(geometry, "dispose");
    const materialDisposed = vi.spyOn(material, "dispose");
    Object.assign(loaded.engineData!, {
      scene: new THREE.Mesh(geometry, material),
      geometry: [geometry],
      materials: [material],
    });
    loaded.internal.loadingState = 4;
    renderer.lruCache.setLoaded(loaded, true);
    const normalVisit = vi.fn(() => false);
    renderer.traverse(normalVisit, null);
    expect(normalVisit).toHaveBeenCalledTimes(5);
    let readsAfterPlugin = 0;
    const pluginVisit = vi.fn(() => false);
    renderer.registerPlugin({
      dispose() {
        renderer.traverse(pluginVisit, null);
        readsAfterPlugin = hierarchyReads;
      },
    });
    const traverse = renderer.traverse;
    const unregister = renderer.unregisterPlugin;
    const remove = vi.spyOn(renderer.lruCache, "remove");
    const host = new THREE.Group();
    host.add(renderer.group);
    disposeTilesRenderer(renderer);
    expect(pluginVisit).toHaveBeenCalledTimes(5);
    expect(hierarchyReads).toBe(readsAfterPlugin);
    expect(remove.mock.calls.map(([tile]) => tile)).toEqual([
      external,
      loaded,
      pending,
    ]);
    expect(removed).toEqual([external]);
    expect(geometryDisposed).toHaveBeenCalledOnce();
    expect(materialDisposed).toHaveBeenCalledOnce();
    expect(
      signals.get("https://example.test/tiles/pending.b3dm")?.aborted
    ).toBe(true);
    expect(renderer.loadingTiles.size).toBe(0);
    expect(renderer.lruCache.has(loaded)).toBe(false);
    expect(renderer.group.parent).toBe(null);
    expect(renderer.traverse).toBe(traverse);
    expect(renderer.unregisterPlugin).toBe(unregister);
  });

  it("reports no request demand after dispose", () => {
    const { layer } = mountRuntime();
    expect(layer.loading.getRequestDemand()).toBeGreaterThan(0);
    layer.scene.dispose();
    expect(layer.loading.getRequestDemand()).toBe(0);
  });
});
