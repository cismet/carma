// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { type Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";
import { MESH_MOTION_COVERAGE_INTERVAL_MS } from "./three-tiles-runtime-config";
import {
  buildTile,
  dispatchedTypes,
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

describe("demand runtime integration", () => {
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
    const root = buildTile("root.json");
    const receiver = buildTile("receiver.b3dm", new THREE.Group());
    const metadata = buildTile("children.json");
    const child = buildTile("outside.b3dm");
    for (const tile of [root, receiver, metadata, child]) {
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
    Object.assign(root.internal, {
      loadingState: 4,
      hasRenderableContent: false,
      hasUnrenderableContent: true,
    });
    Object.assign(receiver.internal, { loadingState: 4 });
    Object.assign(receiver.traversal, { error: 1 });
    Object.assign(metadata.internal, {
      loadingState: 4,
      hasRenderableContent: false,
      hasUnrenderableContent: true,
    });
    Object.assign(root, { children: [receiver, metadata] });
    Object.assign(receiver, { parent: root });
    Object.assign(metadata, { parent: root, children: [child] });
    Object.assign(child, { parent: metadata });
    vi.spyOn(renderer, "calculateTileViewError").mockImplementation(
      (tile, target) => {
        Object.assign(target, {
          inView: tile !== child,
          error: tile === receiver ? 1 : 300,
          distanceFromCamera: 1,
        });
      }
    );
    Object.assign(renderer, { rootTileset: { root } });
    frame.renderCamera.position.x = 1;
    frame.renderCamera.updateMatrixWorld(true);
    layer.scene.update(frame);
    expect(layer.scene.isMainViewReady?.()).toBe(true);
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

  it.each([false, true])(
    "keeps viewport updates live during movement before and after handover (%s)",
    (handover) => {
      const { layer, map, frame, renderer } = mountRuntime(true, false, true);
      const state = layer.debug.readState() as ThreeTilesRuntimeState;
      state.meshInitialHandoverDone = handover;
      let moving = true;
      Object.assign(map, { isMoving: () => moving });
      const emit = (event: string) => {
        const calls = vi.mocked(map.on).mock.calls as unknown as [
          string,
          () => void
        ][];
        for (const [type, handler] of calls) if (type === event) handler();
      };
      const update = vi.mocked(renderer.update);
      update.mockClear();
      emit(MAPLIBRE_EVENT.MOVE_START);
      emit(MAPLIBRE_EVENT.MOVE);
      layer.scene.update(frame);
      expect(update).toHaveBeenCalledTimes(1);
      expect(renderer.loadAncestors).toBe(false);
      vi.advanceTimersByTime(MESH_MOTION_COVERAGE_INTERVAL_MS - 1);
      layer.scene.update(frame);
      expect(update).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      layer.scene.update(frame);
      expect(update).toHaveBeenCalledTimes(3);
      moving = false;
      emit(MAPLIBRE_EVENT.MOVE_END);
      layer.scene.update(frame);
      expect(update).toHaveBeenCalledTimes(4);
      layer.scene.dispose();
    }
  );

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

  it("wakes queued downloads when admission resumes without render polling", async () => {
    const { layer, repaint, frame, renderer } = mountRuntime();
    layer.loading.setRequestConcurrency(0);
    const tile = buildTile("queued.b3dm") as unknown as Tile;
    const run = vi.fn(async () => undefined);
    const pending = renderer.downloadQueue.add(
      "https://example.test/queued.b3dm",
      tile,
      run
    );
    renderer.stats.queued = 1;

    repaint.mockClear();
    layer.scene.update(frame);
    expect(run).not.toHaveBeenCalled();
    expect(repaint).not.toHaveBeenCalled();

    layer.loading.setRequestConcurrency(8);
    repaint.mockClear();
    layer.scene.update(frame);
    await pending;
    expect(run).toHaveBeenCalledOnce();
    expect(repaint).not.toHaveBeenCalled();
    layer.scene.dispose();
  });

  it("wakes one coverage audit when the final request leaves deferred base gaps", () => {
    const { layer, repaint, renderer } = mountRuntime(true, false, true);
    const tile = buildTile("parked.b3dm");
    tile.internal.loadingState = -1;
    const states = (
      window as unknown as {
        __carmaTiles3d: Set<{
          layerId: string;
          deferred: Set<typeof tile>;
          meshBaseCoverageReady: boolean;
          meshDemandSweepPending: boolean;
          viewQualityAuditPasses: number;
        }>;
      }
    ).__carmaTiles3d;
    const state = [...states].find(
      (candidate) => candidate.layerId === "mesh"
    )!;
    state.meshBaseCoverageReady = false;
    state.meshDemandSweepPending = false;
    state.viewQualityAuditPasses = 0;
    state.deferred.add(tile);
    const dispatch = vi.spyOn(renderer, "dispatchEvent");
    repaint.mockClear();

    renderer.dispatchEvent({ type: "tiles-load-end" });

    expect(tile.internal.loadingState).toBe(0);
    expect(state.deferred.size).toBe(0);
    expect(state.meshDemandSweepPending).toBe(true);
    expect(state.viewQualityAuditPasses).toBe(1);
    expect(dispatchedTypes(dispatch)).toContain("needs-update");
    expect(repaint).toHaveBeenCalled();

    dispatch.mockClear();
    repaint.mockClear();
    renderer.dispatchEvent({ type: "tiles-load-end" });
    expect(dispatchedTypes(dispatch)).not.toContain("needs-update");
    expect(repaint).not.toHaveBeenCalled();
    layer.scene.dispose();
  });
});
