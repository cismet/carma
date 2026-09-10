// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";
import { PriorityQueue } from "3d-tiles-renderer/core";
import { Mesh } from "three";
import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("current mesh corridor request admission", () => {
  it("traverses native routing nodes below the SSE target until actual content", () => {
    const f = createMeshCorridorFixture(0, false);
    try {
      f.runtime.scene.setShadowView(null);
      const route = f.tile("route", -10, 10, -100, 0.25, true, f.root);
      route.internal.hasContent = false;
      route.internal.hasRenderableContent = false;
      route.children = [f.receiver];
      f.root.children = [route];
      f.update();
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(route, target);
      expect(target.inView).toBe(true);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
      // A proven empty leaf is still empty; do not invent new requests.
      route.children = [];
      f.renderer.calculateTileViewErrorWithPlugin(route, target);
      expect(target.error).toBe(0.25);
      // ADD's parent-error shortcut must not pretend a contentless parent
      // supplies the child's surface either. Preserve the child's own LOD.
      f.root.refine = "ADD";
      f.setTileError(f.receiver, 0.25);
      f.renderer.calculateTileViewErrorWithPlugin(f.receiver, target);
      expect(
        (target.error * f.root.geometricError) / f.receiver.geometricError
      ).toBeGreaterThan(f.renderer.errorTarget);
      expect(target.error).toBeLessThanOrEqual(f.renderer.errorTarget);
    } finally {
      f.dispose();
    }
  });

  it("keeps native offscreen tiles casting without receiving and restores their role on camera entry", () => {
    const f = createMeshCorridorFixture(0, false);
    const mesh = new Mesh();
    f.caster.engineData.scene!.add(mesh);
    let inView = false;
    f.caster.engineData.boundingVolume!.intersectsFrustum = () => inView;
    vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
      this.frameCount += 1;
      this.visibleTiles.add(f.receiver);
      this.visibleTiles.add(f.caster);
    });
    try {
      f.update();
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(false);
      expect(mesh.material).toMatchObject({
        colorWrite: false,
        depthWrite: false,
      });
      inView = true;
      f.update();
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
      expect(mesh.material).toMatchObject({
        colorWrite: true,
        depthWrite: true,
      });
    } finally {
      f.dispose();
    }
  });

  it("builds native LOD2 caster demand without a mesh receiver frontier", () => {
    const f = createMeshCorridorFixture(0, false);
    f.renderer.group.add(f.receiver.engineData.scene!);
    vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
      this.frameCount += 1;
      this.visibleTiles.add(f.receiver);
    });
    try {
      f.update();
      const casterDemand = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(f.caster, casterDemand);
      expect(casterDemand.inView).toBe(true);
      expect(
        f.runtime.scene.getShadowRegionDiagnostics?.(
          f.corridor,
          16,
          f.receiverBox
        )
      ).toBeTruthy();
    } finally {
      f.dispose();
    }
  });

  it("rechecks cached native corridor proofs when already loaded casters enter the published cut", () => {
    const f = createMeshCorridorFixture(0, false);
    f.renderer.group.add(
      f.receiver.engineData.scene!,
      f.caster.engineData.scene!
    );
    let publishCaster = false;
    vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
      this.frameCount += 1;
      this.visibleTiles.add(f.receiver);
      if (publishCaster) this.visibleTiles.add(f.caster);
    });
    try {
      f.update();
      expect(
        f.runtime.scene.isShadowRegionReady?.(f.corridor, 16, f.receiverBox)
      ).toBe(false);
      publishCaster = true;
      f.update();
      expect(
        f.runtime.scene.isShadowRegionReady?.(f.corridor, 16, f.receiverBox)
      ).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("applies terrain caster detail demand even to visible LOD2 tiles", () => {
    const f = createMeshCorridorFixture(0, false);
    vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
      this.frameCount += 1;
      this.visibleTiles.add(f.receiver);
    });
    try {
      f.setTileError(f.receiver, 0.25);
      f.runtime.scene.setShadowView({
        camera: f.sun,
        shadowMapSize: { width: 1024, height: 1024 },
        terrainReceivers: [
          {
            id: "ground",
            kind: "terrain-tile",
            geometricError: 1,
            errorPixels: 1,
            minimum: f.receiverBox.min.toArray(),
            maximum: f.receiverBox.max.toArray(),
          },
        ],
      });
      f.update();
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(f.receiver, target);
      expect(target.inView).toBe(true);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
    } finally {
      f.dispose();
    }
  });

  it("uses independent terrain boxes for LOD2 corridors over open ground", () => {
    const f = createMeshCorridorFixture(0, false);
    f.root.children = [f.caster];
    f.renderer.group.add(f.caster.engineData.scene!);
    vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
      this.frameCount += 1;
      this.visibleTiles.clear();
      this.visibleTiles.add(f.caster);
    });
    try {
      f.runtime.scene.setShadowView({
        camera: f.sun,
        shadowMapSize: { width: 1024, height: 1024 },
        terrainReceivers: [
          {
            id: "ground",
            kind: "terrain-tile",
            geometricError: 16,
            errorPixels: 16,
            minimum: f.receiverBox.min.toArray(),
            maximum: f.receiverBox.max.toArray(),
          },
        ],
      });
      f.update();
      const diagnostic = f.runtime.scene.getShadowRegionDiagnostics?.(
        f.corridor,
        16,
        f.receiverBox
      );
      expect(diagnostic).toMatchObject({ receiverPrismTested: true });
      expect(diagnostic?.selectedTileIds.length).toBeGreaterThan(0);
    } finally {
      f.dispose();
    }
  });

  it("retains visible receiver/caster coverage at dragstart, through throttled drags and on moveend", async () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    let moving = false;
    vi.spyOn(f.frame.map, "isMoving").mockImplementation(() => moving);
    const emit = (event: string) => {
      const calls = vi.mocked(f.frame.map.on).mock.calls as unknown as [
        string,
        () => void
      ][];
      for (const [type, handler] of calls) if (type === event) handler();
    };
    try {
      f.update();
      const before = f.visibleIds();
      expect(before).toContain("receiver16");
      expect(before).toContain("caster16");
      const children = [
        f.tile("receiver-child-a", -10, 0, -100, 1, true, f.receiver),
        f.tile("receiver-child-b", 0, 10, -100, 1, true, f.receiver),
      ];
      f.receiver.children = children;
      f.load(children[0]); // Incomplete refinement is never a replacement.
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
      moving = true;
      emit(MAPLIBRE_EVENT.MOVE_START);
      expect(f.renderer.downloadQueue.maxJobsPerOrigin).toBe(0);
      expect(f.renderer.parseQueue.maxJobs).toBe(0);
      expect(f.visibleIds()).toEqual(before);
      for (let index = 0; index < 8; index++) {
        emit(MAPLIBRE_EVENT.MOVE);
        await vi.advanceTimersByTimeAsync(60);
        f.update();
        expect(f.visibleIds()).toEqual(before);
        expect(f.receiver.internal.loadingState).toBe(4);
        expect(f.caster.internal.loadingState).toBe(4);
        expect(removed).toEqual([]);
      }
      moving = false;
      emit(MAPLIBRE_EVENT.MOVE_END);
      f.update();
      expect(f.visibleIds()).toEqual(before);
      expect(removed).toEqual(["stale.b3dm"]);
      expect(f.renderer.loadingTiles.has(wanted)).toBe(true);
      expect(f.renderer.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(0);
      expect(f.renderer.parseQueue.maxJobs).toBeGreaterThan(0);
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });
  it("reaches retained fine branches during bootstrap and admits missing siblings instead of their coarse parent", () => {
    const f = createMeshCorridorFixture();
    try {
      // Separate the coverage contract from shadow publication in this fixture.
      f.runtime.scene.setShadowView(null);
      const coarse = f.tile("coarse", -10, 10, -100, 8, true, f.root);
      const fine = f.tile("fine", -10, 0, -100, 0.5, true, coarse);
      const missing = f.tile("missing", 0, 10, -100, 2, true, coarse);
      coarse.children = [fine, missing];
      f.root.children = [coarse];
      f.load(fine);
      f.update();
      // One pass publishes the available cut; the next admits its coverage.
      f.update();
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(coarse, target);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
      f.renderer.queueTileForDownload(coarse);
      f.renderer.queueTileForDownload(missing);
      expect(f.queued).not.toHaveBeenCalledWith(coarse);
      expect(f.queued).toHaveBeenCalledWith(missing);
      f.load(missing);
      f.update();
      expect(f.visibleIds()).toEqual(["fine", "missing"]);
    } finally {
      f.dispose();
    }
  });

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
