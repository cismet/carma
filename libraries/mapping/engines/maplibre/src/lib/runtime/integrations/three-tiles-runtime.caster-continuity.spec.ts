// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";
vi.hoisted(() =>
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:caster-continuity",
  })
);
afterEach(() => vi.restoreAllMocks());
describe("receiver-space caster continuity", () => {
  it("admits a missing coarse caster before publishing its first receiver", () => {
    const f = createMeshCorridorFixture();
    try {
      f.caster.internal.loadingState = 0;
      f.update();
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true); // Depth-only until its corridor exists.
      const material = (
        f.receiver.engineData.scene!.children[0] as import("three").Mesh
      ).material as import("three").MeshStandardMaterial;
      expect(material.colorWrite).toBe(false);
      f.renderer.queueTileForDownload(f.caster);
      expect(f.queued).toHaveBeenCalledWith(f.caster);
      f.load(f.caster);
      f.update();
      expect(material.colorWrite).toBe(true);
      expect(f.renderer.visibleTiles.has(f.caster)).toBe(true);
    } finally {
      f.dispose();
    }
  });
  it("overlays caster children without dropping the parent before receiver-space coverage is complete", () => {
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const fine = f.tile("fine", -10, 10, -100, 1, true, f.receiver);
      f.receiver.children = [fine];
      f.load(fine);
      const a = f.tile("caster-a", -10, 0, -50, 1, false, f.caster);
      const b = f.tile("caster-b", 0, 10, -50, 1, false, f.caster);
      const outside = f.tile("caster-outside", 50, 60, -50, 1, false, f.caster);
      f.caster.children = [a, b, outside];
      f.load(a);
      f.update();
      expect(f.visibleIds()).toEqual(["caster-a", "caster16", "fine"]);
      // A coarser movement/quality target cannot regress the published cut.
      f.runtime.loading.setErrorTarget(96);
      f.update();
      expect(f.visibleIds()).toEqual(["caster-a", "caster16", "fine"]);
      expect(f.renderer.lruCache.remove(f.caster)).toBe(false);
      f.load(b);
      f.update();
      expect(f.visibleIds()).toEqual(["caster-a", "caster-b", "fine"]);
      expect(f.renderer.visibleTiles.has(outside)).toBe(false);
      expect(f.renderer.lruCache.remove(a)).toBe(false);
    } finally {
      f.dispose();
    }
  });
});
