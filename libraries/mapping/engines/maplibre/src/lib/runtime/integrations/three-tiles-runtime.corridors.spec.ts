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
      // Final-quality requests proceed independently of this incomplete view.
      // Readiness above must still reject the missing branch.
      expect(f.renderer.errorTarget).toBe(1);
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

  it("requests the next receiver family with shadows while offscreen casters can refine deeper", () => {
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const left = f.tile("left8", -10, 0, -100, 8, true, f.receiver);
      const right = f.tile("right8", 0, 10, -100, 8, true, f.receiver);
      f.receiver.children = [left, right];
      const grandchild = f.tile("grandchild", -10, -5, -100, 1, true, left);
      left.children = [grandchild];
      const fineCaster = f.tile(
        "fine-caster",
        -10,
        10,
        -50,
        64,
        false,
        f.caster
      );
      f.caster.children = [fineCaster];
      f.caster.geometricError = 128;
      f.setTileError(f.caster, 128);
      f.update();
      const target = {
        inView: false,
        error: Infinity,
        distanceFromCamera: 100,
      };
      f.renderer.calculateTileViewErrorWithPlugin(left, target);
      expect(target.error).toBeLessThanOrEqual(f.renderer.errorTarget);
      f.renderer.calculateTileViewErrorWithPlugin(fineCaster, target);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
      expect(f.queued).toHaveBeenCalledWith(left);
      expect(f.queued).toHaveBeenCalledWith(right);
      f.load(left);
      f.update();
      expect(f.visibleIds()).toContain("receiver16");
      f.load(right);
      f.update();
      expect(f.visibleIds()).toContain("left8");
      expect(f.visibleIds()).toContain("right8");
      expect(f.visibleIds()).not.toContain("receiver16");
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
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
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
