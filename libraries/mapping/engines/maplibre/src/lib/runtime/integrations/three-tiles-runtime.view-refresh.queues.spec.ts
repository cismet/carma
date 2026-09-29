// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import type { RuntimePriorityQueue } from "./three-tiles-runtime-types";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../../core/tile-camera-demand";

import {
  buildTile,
  mount,
  mockTileViews,
} from "./three-tiles-runtime.view-refresh.test-support";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:view-refresh-worker",
  });
});

type TestRenderer = TilesRenderer & {
  frameCount: number;
  loadingTiles: Set<Tile>;
  queuedTiles: Tile[];
};

const placeTile = (
  tile: ReturnType<typeof buildTile>,
  x: number,
  renderer: TilesRenderer,
  halfSize = 1
) => {
  const bounds = new THREE.Box3(
    new THREE.Vector3(x - halfSize, -halfSize, -10 - halfSize),
    new THREE.Vector3(x + halfSize, halfSize, -10 + halfSize)
  );
  const placement = renderer.group.matrixWorld.clone().invert();
  const native = bounds.clone().applyMatrix4(placement);
  const volume = tile.engineData!.boundingVolume!;
  volume.getAABB = (box) => box.copy(native);
  volume.getOBB = (box, transform) => {
    box.copy(bounds);
    transform.copy(placement);
  };
  volume.getSphere = (sphere) => native.getBoundingSphere(sphere);
  volume.intersectsFrustum = (frustum) => frustum.intersectsBox(native);
};

describe("queues runtime integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  it("waits for content events instead of repainting continuously for network work", () => {
    const mounted = mount(
      () => undefined,
      () => false,
      false
    );
    try {
      Object.assign(mounted.renderer.stats, {
        queued: 5,
        downloading: 2,
        parsing: 1,
      });
      vi.mocked(mounted.map.triggerRepaint).mockClear();
      mounted.runtime.scene.update(mounted.frame);
      expect(mounted.map.triggerRepaint).not.toHaveBeenCalled();
      mounted.renderer.dispatchEvent({ type: "needs-update" });
      expect(mounted.map.triggerRepaint).toHaveBeenCalled();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each([
    ["download", TILE_CAMERA_PRIORITY.SECONDARY],
    ["parse", TILE_CAMERA_PRIORITY.SECONDARY],
    ["download", TILE_CAMERA_PRIORITY.FOCUS],
    ["parse", TILE_CAMERA_PRIORITY.FOCUS],
  ] as const)(
    "orders %s by equal-camera gain despite camera rank %s, preserving queued promises",
    async (phase, cameraPriority) => {
      vi.useFakeTimers();
      const mounted = mount();
      mounted.renderer.parseQueue.maxJobs = 1;
      mounted.renderer.downloadQueue.maxJobsPerOrigin = 1;
      try {
        const state = mounted.state;
        state.meshBaseCoverageReady = true;
        state.extentFloorArmed = false;
        state.requestedErrorTarget =
          state.memoryErrorTarget =
          state.effectiveErrorTarget =
            2;
        const extraCamera = new THREE.OrthographicCamera(
          -5,
          5,
          5,
          -5,
          0.1,
          100
        );
        extraCamera.position.set(20, 0, 10);
        state.tileCameraDemand = createTileCameraDemand(
          snapshotTileCameraViews([
            {
              id: TILE_MAIN_OBSERVER_ID,
              camera: mounted.camera,
              viewport: [100, 100],
              errorTargetPixels: 2,
              role: TILE_CAMERA_ROLE.RECEIVER,
            },
            {
              id: "array",
              camera: extraCamera,
              viewport: [100, 100],
              errorTargetPixels: 2,
              role: TILE_CAMERA_ROLE.RECEIVER,
              priority: cameraPriority,
            },
          ])
        );
        const primary = buildTile(1);
        placeTile(primary, 0, mounted.renderer, 0.2);
        const secondary = buildTile(1);
        placeTile(secondary, 20, mounted.renderer);
        // This case arbitrates refinement with existing coverage. Real holes
        // correctly outrank both cameras in the viewport-fill lane.
        for (const child of [primary, secondary]) {
          const fallback = buildTile(child === primary ? 30 : 40);
          fallback.internal.loadingState = 4;
          fallback.children = [child];
          child.parent = fallback;
          state.displayedMeshFrontier.add(fallback);
          mounted.renderer.visibleTiles.add(fallback);
        }
        const higher = secondary;
        const lower = higher === primary ? secondary : primary;
        higher.internal.loadingState = 2;
        for (const tile of [primary, secondary]) {
          tile.internal.renderer = mounted.renderer;
          mounted.renderer.loadingTiles.add(tile);
        }
        let finish!: (result: string) => void;
        const higherJob = vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            })
        );
        const lowerJob = vi.fn().mockResolvedValue("lower");
        const add = (tile: Tile, callback: () => Promise<string>) =>
          phase === "parse"
            ? mounted.renderer.parseQueue.add(tile, callback)
            : mounted.renderer.downloadQueue.add(
                "https://example.test/priority",
                tile,
                callback
              );
        const lowerPromise = add(lower, lowerJob);
        const higherPromise = add(higher, higherJob);
        await vi.advanceTimersByTimeAsync(50);
        expect(higherJob).toHaveBeenCalledOnce();
        expect(lowerJob).not.toHaveBeenCalled();
        mounted.renderer.loadingTiles.delete(higher);
        finish("higher");
        await expect(higherPromise).resolves.toBe("higher");
        await vi.advanceTimersByTimeAsync(50);
        await expect(lowerPromise).resolves.toBe("lower");
        expect(lowerJob).toHaveBeenCalledOnce();
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each(["download", "parse"] as const)(
    "prioritizes %s viewport work before extent reserve without waiting for base readiness",
    async (phase) => {
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const state = mounted.state;
        state.meshBaseCoverageReady = false;
        mounted.setMoving(true);
        mounted.renderer.parseQueue.maxJobs = 1;
        mounted.renderer.downloadQueue.maxJobsPerOrigin = 1;
        state.extentFloorArmed = true;
        state.extentGeometricError = 40;
        const visible = buildTile(1);
        placeTile(visible, 0, mounted.renderer);
        visible.engineData!.boundingVolume!.intersectsFrustum = () => true;
        visible.internal.loadingState = 2;
        const floor = buildTile(40);
        placeTile(floor, 1000, mounted.renderer);
        for (const tile of [visible, floor])
          tile.internal.renderer = mounted.renderer;
        mounted.renderer.loadingTiles.add(visible);
        let finish!: (result: string) => void;
        const visibleJob = vi.fn(
          () =>
            new Promise<string>((resolve) => {
              finish = resolve;
            })
        );
        const floorJob = vi.fn().mockResolvedValue("floor");
        const add = (tile: Tile, callback: () => Promise<string>) =>
          phase === "parse"
            ? mounted.renderer.parseQueue.add(tile, callback)
            : mounted.renderer.downloadQueue.add(
                "https://example.test/tile",
                tile,
                callback
              );
        const visiblePromise = add(visible, visibleJob);
        const floorPromise = add(floor, floorJob);
        await vi.advanceTimersByTimeAsync(50);
        expect(visibleJob).toHaveBeenCalledOnce();
        expect(floorJob).not.toHaveBeenCalled();
        mounted.renderer.loadingTiles.delete(visible);
        finish("visible");
        await expect(visiblePromise).resolves.toBe("visible");
        await vi.advanceTimersByTimeAsync(50);
        expect(state.meshBaseCoverageReady).toBe(false);
        expect(floorJob).not.toHaveBeenCalled();
        mounted.setMoving(false);
        state.meshCoverageRecovery = true;
        if (phase === "parse") mounted.renderer.parseQueue.tryRunJobs();
        else
          for (const queue of mounted.renderer.downloadQueue.originQueues.values())
            queue.tryRunJobs();
        await vi.advanceTimersByTimeAsync(50);
        // Needed reserve keeps its promise, but both stages wait for active views.
        expect(floorJob).not.toHaveBeenCalled();
        state.meshCoverageRecovery = false;
        state.meshBaseCoverageReady = true;
        state.lastMainViewConverged = state.lastActiveViewsConverged = true;
        state.effectiveErrorTarget = state.requestedErrorTarget;
        if (phase === "parse") mounted.renderer.parseQueue.tryRunJobs();
        else
          for (const queue of mounted.renderer.downloadQueue.originQueues.values())
            queue.tryRunJobs();
        await vi.advanceTimersByTimeAsync(50);
        await expect(floorPromise).resolves.toBe("floor");
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it("parses ready viewport work while a higher-priority sibling still downloads", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const state = mounted.state;
      const downloading = buildTile(6);
      downloading.internal.loadingState = 2;
      state.meshRefinementSupport.add(downloading);
      mounted.renderer.loadingTiles.add(downloading);
      const ready = buildTile(6);
      ready.engineData!.boundingVolume!.intersectsFrustum = () => true;
      const parse = vi.fn().mockResolvedValue("ready");
      mounted.setMoving(true);
      const result = mounted.renderer.parseQueue.add(ready, parse);
      await vi.advanceTimersByTimeAsync(50);
      expect(parse).toHaveBeenCalledOnce();
      await expect(result).resolves.toBe("ready");
      expect(downloading.internal.loadingState).toBe(2);
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("wakes a parked decoded-buffer job when its bounds enter the moving camera", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const state = mounted.state;
      const support = buildTile(40);
      placeTile(support, 1000, mounted.renderer);
      state.extentFloorArmed = true;
      state.extentGeometricError = 40;
      mounted.setMoving(true);
      const callback = vi.fn().mockResolvedValue("ready");
      const result = mounted.renderer.parseQueue.add(support, callback);
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();
      placeTile(support, 0, mounted.renderer);
      mounted.camera.position.x += 1;
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      await vi.advanceTimersByTimeAsync(50);
      await expect(result).resolves.toBe("ready");
      expect(callback).toHaveBeenCalledOnce();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it.each([1, 4])(
    "wakes newly visible parked downloads only with spare origin slots (capacity %s)",
    async (capacity) => {
      vi.useFakeTimers();
      const mounted = mount();
      let finishActive: (() => void) | undefined;
      try {
        const state = mounted.state;
        state.extentFloorArmed = true;
        state.extentGeometricError = 40;
        state.requestConcurrency = capacity;
        mounted.setMoving(true);
        mounted.runtime.scene.update(mounted.frame);
        const active = buildTile(1);
        active.internal.loadingState = 2;
        active.engineData!.boundingVolume!.intersectsFrustum = () => true;
        const parked = buildTile(40);
        placeTile(parked, 1000, mounted.renderer);
        parked.internal.loadingState = 1;
        for (const tile of [active, parked]) {
          tile.internal.renderer = mounted.renderer;
          mounted.renderer.loadingTiles.add(tile);
        }
        const activeCallback = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              finishActive = resolve;
            })
        );
        const parkedCallback = vi.fn().mockResolvedValue("ready");
        const activeResult = mounted.renderer.downloadQueue.add(
          "https://example.test/active",
          active,
          activeCallback
        );
        const parkedResult = mounted.renderer.downloadQueue.add(
          "https://example.test/parked",
          parked,
          parkedCallback
        );
        await vi.advanceTimersByTimeAsync(50);
        expect(activeCallback).toHaveBeenCalledOnce();
        expect(parkedCallback).not.toHaveBeenCalled();
        const queue = [
          ...mounted.renderer.downloadQueue.originQueues.values(),
        ][0] as RuntimePriorityQueue;
        expect(queue.currJobs).toBe(1);
        expect(queue.maxJobs).toBe(capacity);
        Object.assign(mounted.renderer.stats, { queued: 1, downloading: 1 });
        const schedule = vi.spyOn(queue, "scheduleJobRun");

        // Existing parked work changes demand without queue insertion, capacity
        // growth, recovery/base-readiness changes or a completed download.
        placeTile(parked, 0, mounted.renderer);
        mounted.camera.position.x += 1;
        mounted.camera.updateMatrixWorld(true);
        mounted.runtime.scene.update(mounted.frame);
        expect(schedule).toHaveBeenCalledTimes(capacity > 1 ? 1 : 0);
        await vi.advanceTimersByTimeAsync(50);
        expect(parkedCallback).toHaveBeenCalledTimes(capacity > 1 ? 1 : 0);
        expect(queue.currJobs).toBe(1);

        schedule.mockClear();
        mounted.runtime.scene.update(mounted.frame);
        expect(schedule).not.toHaveBeenCalled();
        finishActive?.();
        await activeResult;
        await vi.advanceTimersByTimeAsync(50);
        await expect(parkedResult).resolves.toBe("ready");
      } finally {
        finishActive?.();
        mounted.runtime.scene.dispose();
      }
    }
  );

  it.each([false, true])(
    "preserves downloaded buffers when viewport priority changes across the yield: %s",
    async (runnable) => {
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const state = mounted.state;
        const background = buildTile(40);
        placeTile(background, 1000, mounted.renderer);
        state.extentFloorArmed = true;
        state.extentGeometricError = 40;
        state.meshBaseCoverageReady = true;
        state.lastMainViewConverged = state.lastActiveViewsConverged = true;
        state.effectiveErrorTarget = state.requestedErrorTarget;
        const foreground = buildTile(1);
        foreground.engineData!.boundingVolume!.intersectsFrustum = () => true;
        if (!runnable) {
          state.requestedErrorTarget = 6;
          state.effectiveErrorTarget = 6;
          state.memoryErrorTarget = 6;
          const parent = buildTile(8);
          parent.internal.loadingState = 4;
          parent.children = [foreground];
          foreground.parent = parent;
          mockTileViews(mounted.renderer, [parent, foreground]);
          mounted.setMoving(true);
        }
        const backgroundCallback = vi.fn().mockResolvedValue("background");
        const foregroundCallback = vi.fn().mockResolvedValue("foreground");
        const disposed = vi.fn();
        mounted.renderer.lruCache.add(background, disposed);
        mounted.renderer.parseQueue.maxJobs = 1;
        const result = mounted.renderer.parseQueue.add(
          background,
          backgroundCallback
        );
        const outcome = expect(result).resolves.toBe("background");
        mounted.renderer.parseQueue.tryRunJobs();
        const next = mounted.renderer.parseQueue.add(
          foreground,
          foregroundCallback
        );
        await vi.advanceTimersByTimeAsync(50);
        if (!runnable) {
          // While moving, background reserve stays parked even when the
          // finer foreground job is itself above the motion target.
          expect(backgroundCallback).not.toHaveBeenCalled();
          expect(disposed).not.toHaveBeenCalled();
          expect(foregroundCallback).not.toHaveBeenCalled();
          mounted.setMoving(false);
          mounted.renderer.parseQueue.tryRunJobs();
          await vi.advanceTimersByTimeAsync(50);
          await expect(next).resolves.toBe("foreground");
          expect(foregroundCallback).toHaveBeenCalledOnce();
          await outcome;
          expect(backgroundCallback).toHaveBeenCalledOnce();
          return;
        }
        await outcome;
        await expect(next).resolves.toBe("foreground");
        expect(backgroundCallback).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
        expect(foregroundCallback).toHaveBeenCalledOnce();
      } finally {
        mounted.runtime.scene.dispose();
      }
    }
  );

  it("rejects obsolete work after the pre-parse yield instead of decoding the old view", async () => {
    vi.useFakeTimers();
    const mounted = mount();
    try {
      const tile = buildTile(1);
      tile.engineData!.boundingVolume!.intersectsFrustum = () => true;
      const callback = vi.fn().mockResolvedValue("decoded");
      const result = mounted.renderer.parseQueue.add(tile, callback);
      const rejected = expect(result).rejects.toMatchObject({
        name: "AbortError",
      });
      mounted.renderer.parseQueue.tryRunJobs();
      tile.engineData!.boundingVolume!.intersectsFrustum = () => false;
      // Leave both the observer and the actual one-tile prefetch reserve.
      mounted.camera.position.x += 1000;
      mounted.camera.updateMatrixWorld(true);
      mounted.runtime.scene.update(mounted.frame);
      await vi.advanceTimersByTimeAsync(50);
      await rejected;
      expect(callback).not.toHaveBeenCalled();
    } finally {
      mounted.runtime.scene.dispose();
    }
  });

  it("does not cancel at move start and waits for new-camera preparation", () => {
    const mounted = mount();
    const pending = buildTile(1);
    pending.internal.loadingState = 2;
    const disposed = vi.fn();
    mounted.renderer.loadingTiles.add(pending);
    mounted.renderer.lruCache.add(pending, disposed);
    mounted.setMoving(true);
    mounted.handlers.get(MAPLIBRE_EVENT.MOVE_START)?.();
    expect(disposed).not.toHaveBeenCalled();
    expect(mounted.map.triggerRepaint).toHaveBeenCalled();

    mounted.camera.position.x = 10;
    mounted.camera.updateMatrixWorld(true);
    mounted.runtime.scene.update(mounted.frame);
    expect(disposed).toHaveBeenCalledOnce();
    mounted.runtime.scene.dispose();
  });
});
