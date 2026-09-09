// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue } from "3d-tiles-renderer/core";
import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("current mesh corridor request admission", () => {
  it("wakes paused downloads on capacity recovery without another traversal", () => {
    const f = createMeshCorridorFixture();
    const queue = new PriorityQueue();
    const schedule = vi.spyOn(queue, "scheduleJobRun").mockImplementation(() => {});
    const start = vi.spyOn(queue, "tryRunJobs").mockImplementation(() => {});
    const origin = "https://resume.example.test";
    try {
      f.renderer.downloadQueue.originQueues.set(origin, queue);
      f.renderer.downloadQueue.maxJobsPerOrigin = 0;
      const frame = f.renderer.frameCount;
      f.renderer.dispatchEvent({ type: "load-model" });
      expect(f.renderer.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(1);
      expect(schedule).toHaveBeenCalledTimes(1);
      expect(start).not.toHaveBeenCalled();
      expect(f.renderer.frameCount).toBe(frame);
      // Unchanged capacity must not enqueue redundant wakeups per tile.
      f.renderer.dispatchEvent({ type: "load-model" });
      expect(schedule).toHaveBeenCalledTimes(1);
    } finally {
      f.renderer.downloadQueue.originQueues.delete(origin);
      f.dispose();
    }
  });

  it("selects sunward casters while unrelated downloads run, without a second native camera", () => {
    const setCamera = vi.spyOn(TilesRenderer.prototype, "setCamera");
    const f = createMeshCorridorFixture();
    try {
      f.renderer.stats.downloading = 1;
      f.update();
      expect(f.visibleIds()).toEqual(["caster16", "receiver16"]);
      expect(setCamera).not.toHaveBeenCalledWith(f.sun);
      expect(setCamera).toHaveBeenCalledWith(f.frame.lodCamera);
    } finally {
      f.dispose();
    }
  });

  it("cancels obsolete pending payloads after a solar demand refresh, keeping visible and required payloads", () => {
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const stale = f.tile("stale", 150, 160, -50, 0, false, f.root);
      const wanted = f.tile("wanted", -5, 5, -50, 0, false, f.root);
      const removed: string[] = [];
      for (const value of [stale, wanted]) {
        value.internal.loadingState = 2;
        f.renderer.loadingTiles.add(value);
        f.renderer.lruCache.add(value, () => {
          removed.push(value.content.uri!);
          f.renderer.loadingTiles.delete(value);
        });
      }
      f.sun.rotateY(0.01);
      f.setSun();
      f.update();
      expect(removed).toEqual(["stale.b3dm"]);
      expect(f.renderer.loadingTiles.has(wanted)).toBe(true);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
      expect(f.renderer.lruCache.has(f.caster)).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("orders receiver requests near-first and does not restart demand for loaded meshes", () => {
    const f = createMeshCorridorFixture();
    try {
      const near = f.tile("near", -10, 0, -100, 1, true, f.receiver);
      const far = f.tile("far", 0, 10, -100, 1, true, f.receiver);
      f.receiver.children = [near, far];
      f.update();
      near.traversal.distanceFromCamera = 10;
      far.traversal.distanceFromCamera = 1000;
      f.renderer.queueTileForDownload(far);
      f.renderer.queueTileForDownload(near);
      expect(
        f.renderer.downloadQueue.priorityCallback!(near, far)
      ).toBeGreaterThan(0);
      f.load(near);
      f.load(far);
      f.update();
      f.queued.mockClear();
      f.renderer.queueTileForDownload(near);
      f.renderer.queueTileForDownload(far);
      expect(f.queued).not.toHaveBeenCalled();
      expect(f.visibleIds()).toEqual(["caster16", "far", "near"]);
    } finally {
      f.dispose();
    }
  });

  it("admits missing receiver children and caster detail without a removed publication acknowledgement", () => {
    const f = createMeshCorridorFixture();
    try {
      const left = f.tile("left1", -10, 0, -100, 1, true, f.receiver);
      const right = f.tile("right1", 0, 10, -100, 1, true, f.receiver);
      const caster = f.tile("caster-final", -10, 10, -50, 0, false, f.caster);
      f.receiver.children = [left, right];
      f.caster.children = [caster];
      f.load(left);
      f.update();
      f.queued.mockClear();
      f.renderer.queueTileForDownload(right);
      f.renderer.queueTileForDownload(caster);
      expect(f.queued.mock.calls.map(([tile]) => tile)).toEqual([
        right,
        caster,
      ]);
      // Even when the native mock does not update loadingState, same-traversal
      // admission is idempotent. A real pending or loaded payload is never added.
      f.renderer.queueTileForDownload(right);
      f.renderer.queueTileForDownload(caster);
      f.renderer.queueTileForDownload(left);
      expect(f.queued).toHaveBeenCalledTimes(2);
      f.load(right);
      f.load(caster);
      f.update();
      expect(f.visibleIds()).toEqual(["caster-final", "left1", "right1"]);
      expect(
        f.runtime.scene.isShadowRegionReady?.(f.corridor, 1, f.receiverBox)
      ).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("does not requeue pending payloads on a new traversal", () => {
    const f = createMeshCorridorFixture();
    try {
      const pending = f.tile("pending", -10, 10, -100, 1, true, f.receiver);
      f.receiver.children = [pending];
      pending.internal.loadingState = 2;
      f.update();
      f.queued.mockClear();
      f.renderer.queueTileForDownload(pending);
      expect(f.queued).not.toHaveBeenCalled();
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
    } finally {
      f.dispose();
    }
  });
});
