// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("mesh receiver and sunward caster publication", () => {
  it("does not declare a partial loaded viewport complete", () => {
    const f = createMeshCorridorFixture();
    try {
      const missing = f.tile("missing", 12, 22, -100, 1, true, f.root);
      f.root.children.push(missing);
      f.update();
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
      expect(f.runtime.scene.isMainViewReady()).toBe(false);
      expect(f.renderer.errorTarget).toBe(16);
      f.load(missing);
      f.update();
      expect(f.renderer.visibleTiles.has(missing)).toBe(true);
      expect(f.runtime.scene.isMainViewReady()).toBe(true);
      expect(f.renderer.errorTarget).toBe(1);
    } finally {
      f.dispose();
    }
  });

  it("uses current camera errors rather than a previous traversal's LOD", () => {
    const f = createMeshCorridorFixture();
    try {
      const child = f.tile("next1", -10, 10, -100, 1, true, f.receiver);
      f.receiver.children = [child];
      f.receiver.traversal.error = 0.25;
      f.setTileError(f.receiver, 16);
      f.update();
      expect(f.runtime.scene.isMainViewReady()).toBe(false);
      f.renderer.queueTileForDownload(child);
      expect(f.queued).toHaveBeenCalledWith(child);
    } finally {
      f.dispose();
    }
  });

  it("keeps the settled audit awake for an unloaded visible branch", () => {
    vi.useFakeTimers();
    const f = createMeshCorridorFixture();
    try {
      f.root.children.push(f.tile("missing", 12, 22, -100, 1, true, f.root));
      f.update();
      vi.mocked(f.frame.map.triggerRepaint).mockClear();
      vi.advanceTimersByTime(1_000);
      expect(f.frame.map.triggerRepaint).toHaveBeenCalled();
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
    } finally {
      f.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps loaded target-quality receivers under their own cache pressure", () => {
    const f = createMeshCorridorFixture();
    try {
      const fine = f.tile(
        "receiver-quarter",
        -10,
        10,
        -100,
        0.25,
        true,
        f.receiver
      );
      f.receiver.children = [fine];
      f.load(fine);
      f.runtime.loading.setErrorTarget(0.25);
      f.update();
      expect(f.runtime.scene.isMainViewReady()).toBe(true);
      f.runtime.loading.setCacheBudget(1024 ** 3);
      f.renderer.lruCache.setMemoryUsage(fine, 2 * 1024 ** 3);
      expect(f.renderer.lruCache.isFull()).toBe(true);
      f.update();
      expect(f.renderer.visibleTiles.has(fine)).toBe(true);
      expect(f.renderer.lruCache.has(fine)).toBe(true);
      expect(f.runtime.scene.isMainViewReady()).toBe(true);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(false);
    } finally {
      f.dispose();
    }
  });

  it.each([0, Math.PI / 4])(
    "retains intersecting offscreen casters independently of traversal (rotation %s)",
    (rotation) => {
      const f = createMeshCorridorFixture(rotation);
      try {
        f.update();
        expect(f.visibleIds()).toEqual(["caster16", "receiver16"]);
        expect(f.renderer.visibleTiles.size).toBe(2);
        const unrelated = f.tile("unrelated", 100, 110, -50, 0, false, f.root);
        const behind = f.tile("behind-receiver", -5, 5, -150, 0, false, f.root);
        f.root.children.push(unrelated, behind);
        f.load(unrelated);
        f.load(behind);
        f.update();
        expect(f.visibleIds()).toEqual(["caster16", "receiver16"]);
        // Empty upstream visibleTiles is not eviction proof for a required caster.
        f.update();
        expect(f.visibleIds()).toEqual(["caster16", "receiver16"]);
      } finally {
        f.dispose();
      }
    }
  );

  it("replaces a receiver parent only with its complete loaded family, without waiting for another corridor", () => {
    const f = createMeshCorridorFixture();
    try {
      const left = f.tile("left1", -10, 0, -100, 1, true, f.receiver);
      const right = f.tile("right1", 0, 10, -100, 1, true, f.receiver);
      const fineCaster = f.tile(
        "caster-final",
        -10,
        10,
        -50,
        0,
        false,
        f.caster
      );
      f.caster.children = [fineCaster];
      f.receiver.children = [left, right];
      f.load(left);
      f.update();
      expect(f.visibleIds()).toEqual(["caster16", "receiver16"]);
      f.load(right);
      f.update();
      expect(f.visibleIds()).toEqual(["caster16", "left1", "right1"]);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(false);
      // Caster quality and soft-mask readiness are separate from mesh residency.
      // No removed acknowledgeShadowStage/setShadowStagePresentationGate API.
      expect(
        f.runtime.scene.isShadowRegionReady?.(f.corridor, 1, f.receiverBox)
      ).toBe(false);
      f.load(fineCaster);
      f.update();
      expect(f.visibleIds()).toEqual(["caster-final", "left1", "right1"]);
      expect(
        f.runtime.scene.isShadowRegionReady?.(f.corridor, 1, f.receiverBox)
      ).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("retains a city-root fallback until all intersecting children are loaded", () => {
    const f = createMeshCorridorFixture();
    try {
      f.root.internal.hasContent = true;
      f.root.internal.hasRenderableContent = true;
      f.load(f.root);
      const missing = f.tile("missing", 20, 30, -100, 1, true, f.root);
      f.root.children.push(missing);
      f.update();
      expect(f.renderer.visibleTiles.has(f.root)).toBe(true);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(false);
      f.load(missing);
      f.update();
      expect(f.renderer.visibleTiles.has(f.root)).toBe(false);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
      expect(f.renderer.visibleTiles.has(missing)).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it("does not remove the published mesh cut when only solar direction changes", () => {
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const published = new Set(f.renderer.visibleTiles);
      const mesh = f.receiver.engineData.scene;
      f.sun.rotateY(0.2);
      f.setSun();
      expect(f.renderer.visibleTiles).toEqual(published);
      f.update();
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
      expect(f.receiver.engineData.scene).toBe(mesh);
      expect(f.renderer.lruCache.has(f.receiver)).toBe(true);
    } finally {
      f.dispose();
    }
  });
});
