// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { PriorityQueue } from "3d-tiles-renderer/core";

import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("queues runtime integration", () => {
  it("parks payload jobs behind base coverage without rejecting their original promises", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const end = vi
        .mocked(f.frame.map.on)
        .mock.calls.find(
          ([event]) => event === MAPLIBRE_EVENT.MOVE_END
        )![1] as () => void;
      end();
      expect(f.runtime.scene.isBaseViewReady?.()).toBe(false);
      const visible = f.tile("base-work", -5, 5, -100, 0, true, f.root);
      const caster = f.tile("parked-caster", -5, 5, -50, 0, false, f.root);
      const baseJob = vi.fn(() => Promise.resolve("base"));
      const casterJob = vi.fn(() => Promise.resolve("caster"));
      const base = f.renderer.downloadQueue.add(
        "https://example.test/base",
        visible,
        baseJob
      );
      const parked = f.renderer.downloadQueue.add(
        "https://example.test/caster",
        caster,
        casterJob
      );
      for (const queue of f.renderer.downloadQueue.originQueues.values())
        queue.tryRunJobs();
      expect(baseJob).toHaveBeenCalledOnce();
      expect(casterJob).not.toHaveBeenCalled();
      expect(f.renderer.downloadQueue.has(caster)).toBe(true);
      expect(await base).toBe("base");
      f.update();
      expect(f.runtime.scene.isBaseViewReady?.()).toBe(true);
      await vi.advanceTimersByTimeAsync(50);
      expect(await parked).toBe("caster");
      expect(casterJob).toHaveBeenCalledOnce();
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("discovers metadata while payload download and parse queues are paused", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    const metadata = f.tile("external", -10, 10, -100, 16, true, f.root);
    metadata.internal.hasUnrenderableContent = true;
    try {
      f.renderer.downloadQueue.maxJobsPerOrigin = 0;
      f.renderer.parseQueue.maxJobs = 0;
      const download = vi.fn().mockResolvedValue({ root: {} });
      const parse = vi.fn().mockResolvedValue("metadata ready");
      const result = f.renderer.downloadQueue
        .add("https://example.test/external.json", metadata, download)
        .then(() => f.renderer.parseQueue.add(metadata, parse));
      await vi.advanceTimersByTimeAsync(40);
      await expect(result).resolves.toBe("metadata ready");
      expect(download).toHaveBeenCalledOnce();
      expect(parse).toHaveBeenCalledOnce();
      expect(f.renderer.downloadQueue.maxJobsPerOrigin).toBe(0);
      expect(f.renderer.parseQueue.maxJobs).toBe(0);
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("cancels queued metadata through the native queue facade", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    const metadata = f.tile("external", -10, 10, -100, 16, true, f.root);
    metadata.internal.hasUnrenderableContent = true;
    try {
      const download = vi.fn();
      const result = f.renderer.downloadQueue
        .add("https://example.test/external.json", metadata, download)
        .catch(() => "cancelled");
      expect(f.renderer.downloadQueue.has(metadata)).toBe(true);
      f.renderer.downloadQueue.remove(metadata);
      expect(f.renderer.downloadQueue.has(metadata)).toBe(false);
      await vi.advanceTimersByTimeAsync(40);
      expect(download).not.toHaveBeenCalled();
      expect(await result).toBe("cancelled");
      const parse = vi.fn();
      const parsed = f.renderer.parseQueue
        .add(metadata, parse)
        .catch(() => "cancelled");
      expect(f.renderer.parseQueue.has(metadata)).toBe(true);
      f.renderer.parseQueue.remove(metadata);
      expect(f.renderer.parseQueue.has(metadata)).toBe(false);
      await vi.advanceTimersByTimeAsync(5);
      expect(parse).not.toHaveBeenCalled();
      expect(await parsed).toBe("cancelled");
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("starts parsing without waiting for a render frame", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    try {
      const frame = f.renderer.frameCount;
      const parse = vi.fn().mockResolvedValue("decoded");
      const result = f.renderer.parseQueue.add(f.receiver, parse);
      expect(parse).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5);
      await expect(result).resolves.toBe("decoded");
      expect(f.renderer.frameCount).toBe(frame);
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("yields before a native parse job and preserves its result", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    try {
      f.renderer.parseQueue.autoUpdate = false;
      const parse = vi.fn().mockResolvedValue("decoded");
      const result = f.renderer.parseQueue.add(f.receiver, parse);
      f.renderer.parseQueue.tryRunJobs();
      expect(parse).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toBe("decoded");
      expect(parse).toHaveBeenCalledWith(f.receiver);
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("does not parse a yielded job after runtime disposal", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    try {
      f.renderer.parseQueue.autoUpdate = false;
      const parse = vi.fn();
      const result = f.renderer.parseQueue.add(f.receiver, parse);
      f.renderer.parseQueue.tryRunJobs();
      f.dispose();
      await vi.advanceTimersByTimeAsync(1);
      await result;
      expect(parse).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("wakes paused downloads on capacity recovery without another traversal", () => {
    const f = createMeshCorridorFixture();
    const queue = new PriorityQueue();
    const schedule = vi
      .spyOn(queue, "scheduleJobRun")
      .mockImplementation(() => {});
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
