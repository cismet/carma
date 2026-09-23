// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";

import { Mesh } from "three";
import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

afterEach(() => vi.restoreAllMocks());

describe("native runtime integration", () => {
  it("traverses native routing nodes below the SSE target until actual content", () => {
    const f = createMeshCorridorFixture(0, false);
    try {
      f.runtime.scene.setShadowView(null);
      const route = f.tile("route", -10, 10, -100, 0.01, true, f.root);
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
      const projection = f.frame.lodCamera.projectionMatrix.elements;
      const pixelsPerMeter =
        Math.max(
          Math.abs(projection[0]) * f.frame.viewport.x,
          Math.abs(projection[5]) * f.frame.viewport.y
        ) /
        2 /
        99;
      expect(target.error).toBeCloseTo(route.geometricError * pixelsPerMeter);
      // ADD's parent-error shortcut must not pretend a contentless parent
      // supplies the child's surface either. Preserve the child's own LOD.
      f.root.refine = "ADD";
      f.receiver.geometricError = 0.01;
      f.update();
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
});
