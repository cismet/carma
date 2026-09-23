// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";

import {
  buildTile,
  mount,
  mockTileViews,
} from "./three-tiles-runtime.view-refresh.test-support";
const prefetchPolicy = vi.hoisted(() => ({ levels: 1 }));

vi.mock("./three-tiles-runtime-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./three-tiles-runtime-config")>()),
  get MESH_REFINEMENT_PREFETCH_LEVELS() {
    return prefetchPolicy.levels;
  },
}));

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

describe("queues runtime integration", () => {
  afterEach(() => {
    prefetchPolicy.levels = 1;
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
    "arbitrates %s work between main and camera rank %s, then resumes the parked promise",
    async (phase, cameraPriority) => {
      vi.useFakeTimers();
      const mounted = mount();
      mounted.renderer.parseQueue.maxJobs = 1;
      mounted.renderer.downloadQueue.maxJobsPerOrigin = 1;
      try {
        const state = mounted.state;
        state.meshBaseCoverageReady = true;
        state.extentFloorArmed = false;
        const extraCamera = new THREE.OrthographicCamera(
          -5,
          5,
          5,
          -5,
          0.1,
          100
        );
        extraCamera.position.z = 10;
        state.tileCameraDemand = createTileCameraDemand(
          snapshotTileCameraViews([
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
        primary.engineData!.boundingVolume!.intersectsFrustum = () => true;
        primary.engineData!.boundingVolume!.getAABB = (box) =>
          box.set(new THREE.Vector3(19, -1, -1), new THREE.Vector3(21, 1, 1));
        const secondary = buildTile(1);
        const higher =
          cameraPriority > TILE_CAMERA_PRIORITY.PRIMARY ? secondary : primary;
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
        visible.engineData!.boundingVolume!.intersectsFrustum = () => true;
        visible.internal.loadingState = 2;
        const floor = buildTile(40);
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
        // Recovery cannot fall through to idle reserve downloads when no
        // finite-rank payload is queued. Decoded buffers keep progressing.
        expect(floorJob).toHaveBeenCalledTimes(phase === "parse" ? 1 : 0);
        state.meshCoverageRecovery = false;
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
      state.extentFloorArmed = true;
      state.extentGeometricError = 40;
      mounted.setMoving(true);
      const callback = vi.fn().mockResolvedValue("ready");
      const result = mounted.renderer.parseQueue.add(support, callback);
      await vi.advanceTimersByTimeAsync(50);
      expect(callback).not.toHaveBeenCalled();
      support.engineData!.boundingVolume!.intersectsFrustum = () => true;
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

  it.each([false, true])(
    "preempts background parsing only for runnable viewport work across the yield: %s",
    async (runnable) => {
      vi.useFakeTimers();
      const mounted = mount();
      try {
        const state = mounted.state;
        const background = buildTile(40);
        state.extentFloorArmed = true;
        state.extentGeometricError = 40;
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
        const outcome = runnable
          ? expect(result).rejects.toMatchObject({ name: "AbortError" })
          : expect(result).resolves.toBe("background");
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
        expect(backgroundCallback).not.toHaveBeenCalled();
        expect(disposed).toHaveBeenCalledOnce();
        expect(foregroundCallback).toHaveBeenCalledOnce();
        // The tile stays eligible for a later request, not permanently disabled.
        expect(state.extentFloorArmed).toBe(true);
        expect(background.geometricError).toBe(state.extentGeometricError);
        const retried = mounted.renderer.parseQueue.add(
          background,
          backgroundCallback
        );
        await vi.advanceTimersByTimeAsync(50);
        await expect(retried).resolves.toBe("background");
        expect(backgroundCallback).toHaveBeenCalledOnce();
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
      mounted.camera.position.x += 1;
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
