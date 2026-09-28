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
  it("switches caster depth only when all relevant child branches are drawable", () => {
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
      expect(f.visibleIds()).toEqual(["caster16", "fine"]);
      expect(
        (f.caster.engineData.scene!.children[0] as import("three").Mesh)
          .castShadow
      ).toBe(true);
      expect(f.renderer.visibleTiles.has(a)).toBe(false);
      // A coarser movement/quality target cannot regress the published cut.
      f.runtime.loading.setErrorTarget(96);
      f.update();
      expect(f.visibleIds()).toEqual(["caster16", "fine"]);
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
  it.each([1, 96])("switches viewport colour and depth together at target %s", (targetError) => {
    const f = createMeshCorridorFixture();
    try {
      f.update();
      const a = f.tile("receiver-a", -10, 0, -100, 1, true, f.receiver);
      const b = f.tile("receiver-b", 0, 10, -100, 1, true, f.receiver);
      f.receiver.children = [a, b];
      f.load(a);
      f.update();
      f.runtime.loading.setErrorTarget(targetError);
      f.update();
      const demand = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(f.receiver, demand);
      expect(demand.error).toBeGreaterThan(f.renderer.errorTarget);
      const mesh = (t: typeof a) =>
        t.engineData.scene!.children[0] as import("three").Mesh;
      expect(f.renderer.visibleTiles.has(a)).toBe(false);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(true);
      expect(mesh(f.receiver).castShadow).toBe(true);
      f.load(b);
      f.update();
      expect(mesh(a).castShadow).toBe(true);
      expect(mesh(b).castShadow).toBe(true);
      expect(f.renderer.visibleTiles.has(f.receiver)).toBe(false);
    } finally {
      f.dispose();
    }
  });
  it("continues through fine caster ancestors when a new coarse receiver relaxes demand", () => {
    const f = createMeshCorridorFixture();
    try {
      const fine = f.tile("fine-receiver", -10, 10, -100, 1, true, f.receiver);
      f.receiver.children = [fine];
      const caster = f.tile("fine-caster", -10, 10, -50, 1, false, f.caster);
      f.caster.children = [caster];
      f.load(fine);
      f.load(caster);
      f.update();
      expect(f.visibleIds()).toContain("fine-caster");
      const coarse = f.tile(
        "new-coarse-receiver",
        -10,
        10,
        -120,
        16,
        true,
        f.root
      );
      f.root.children.push(coarse);
      f.load(coarse);
      f.setTileInView(f.receiver, false);
      f.setTileInView(fine, false);
      f.runtime.loading.setErrorTarget(96);
      f.update();
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(f.caster, target);
      expect(target.inView).toBe(true);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
    } finally {
      f.dispose();
    }
  });
});
