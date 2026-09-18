// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import { Mesh, OrthographicCamera, PerspectiveCamera } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMeshCorridorFixture } from "../../../../test/three-tiles-runtime-fixture";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import type { SharedThreeSceneFrame } from "../../core/shared-three-scene-types";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:tile-camera-demand-test",
  });
});
afterEach(() => vi.restoreAllMocks());

describe("shared 3D Tiles camera demand", () => {
  it.each([false, true])(
    "unions perspective and orthographic demand without a second renderer (terrain=%s)",
    (terrain) => {
      const f = createMeshCorridorFixture(0, terrain);
      f.runtime.scene.setShadowView(null);
      const perspective = new PerspectiveCamera(60, 1, 1, 200);
      const ortho = new OrthographicCamera(-20, 20, 20, -20, 1, 200);
      const views = [perspective, ortho].map((camera, index) => ({
        id: `query-${index}`,
        camera,
        viewport: [400, 400] as const,
        errorTargetPixels: 2,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      }));
      const update = (count: number) =>
        f.runtime.scene.update({
          ...f.frame,
          tileCameraViews: snapshotTileCameraViews(views.slice(0, count)),
        });
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      try {
        update(2);
        f.renderer.calculateTileViewErrorWithPlugin(f.caster, target);
        expect(target.inView).toBe(true);
        expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
        expect(f.renderer.cameras).toHaveLength(1);
        update(1);
        f.renderer.calculateTileViewErrorWithPlugin(f.caster, target);
        expect(target.inView).toBe(true);
        update(0);
        f.renderer.calculateTileViewErrorWithPlugin(f.caster, target);
        expect(target.inView).toBe(false);
      } finally {
        f.dispose();
      }
    }
  );

  it.each([false, true])(
    "publishes geometry-only demand and promotes the same payload (terrain=%s)",
    (terrain) => {
      const f = createMeshCorridorFixture(0, terrain);
      f.runtime.scene.setShadowView(null);
      const payload = f.caster.engineData.scene;
      const mesh = payload!.children[0] as Mesh;
      const camera = new PerspectiveCamera(60, 1, 1, 200);
      vi.mocked(TilesRenderer.prototype.update).mockImplementation(function () {
        this.frameCount += 1;
        this.visibleTiles.add(f.receiver);
        this.visibleTiles.add(f.caster);
      });
      const frame: SharedThreeSceneFrame = { ...f.frame };
      try {
        frame.tileCameraViews = snapshotTileCameraViews([
          {
            id: "inspection",
            camera,
            viewport: [400, 400],
            errorTargetPixels: 2,
            role: TILE_CAMERA_ROLE.GEOMETRY,
          },
        ]);
        f.runtime.scene.update(frame);
        expect(f.renderer.visibleTiles.has(f.caster)).toBe(true);
        expect(payload?.parent).toBe(f.renderer.group);
        expect(mesh.receiveShadow).toBe(false);
        frame.tileCameraViews = snapshotTileCameraViews([
          {
            id: "inspection",
            camera,
            viewport: [400, 400],
            errorTargetPixels: 2,
            role: TILE_CAMERA_ROLE.RECEIVER,
          },
        ]);
        f.runtime.scene.update(frame);
        expect(f.caster.engineData.scene).toBe(payload);
        expect(mesh.receiveShadow).toBe(true);
        expect(mesh.material).toMatchObject({ colorWrite: true });
      } finally {
        f.dispose();
      }
    }
  );

  it("traverses zero-error offscreen routing nodes for an additional camera", () => {
    const f = createMeshCorridorFixture(0, false);
    f.runtime.scene.setShadowView(null);
    const route = f.tile("route", -10, 10, -50, 0, false, f.root);
    route.internal.hasRenderableContent = false;
    route.children = [f.caster];
    const camera = new PerspectiveCamera(60, 1, 1, 200);
    try {
      f.runtime.scene.update({
        ...f.frame,
        tileCameraViews: snapshotTileCameraViews([
          {
            id: "rays",
            camera,
            viewport: [400, 400],
            errorTargetPixels: 2,
            role: TILE_CAMERA_ROLE.GEOMETRY,
          },
        ]),
      });
      const target = { inView: false, error: 0, distanceFromCamera: 0 };
      f.renderer.calculateTileViewErrorWithPlugin(route, target);
      expect(target.inView).toBe(true);
      expect(target.error).toBeGreaterThan(f.renderer.errorTarget);
    } finally {
      f.dispose();
    }
  });

  it("cancels obsolete pending work after a registered camera matrix-only update", () => {
    const f = createMeshCorridorFixture(0, true);
    f.runtime.scene.setShadowView(null);
    const obsolete = f.tile(
      "obsolete",
      10_000,
      10_010,
      10_000,
      10_010,
      false,
      f.root
    );
    obsolete.internal.loadingState = 2;
    const camera = new PerspectiveCamera(60, 1, 1, 200);
    const frame: SharedThreeSceneFrame = { ...f.frame };
    const remove = vi
      .spyOn(f.renderer.lruCache, "remove")
      .mockImplementation((tile) => {
        if (tile === obsolete) obsolete.internal.loadingState = 0;
        return true;
      });
    try {
      frame.tileCameraViews = snapshotTileCameraViews([
        {
          id: "inspection",
          camera,
          viewport: [400, 400],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      f.runtime.scene.update(frame);
      f.renderer.loadingTiles.add(obsolete);

      camera.position.x = 5;
      camera.updateMatrixWorld(true);
      frame.tileCameraViews = snapshotTileCameraViews([
        {
          id: "inspection",
          camera,
          viewport: [400, 400],
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        },
      ]);
      f.runtime.scene.update(frame);

      expect(remove).toHaveBeenCalledWith(obsolete);
      expect(obsolete.internal.loadingState).toBe(0);
    } finally {
      f.dispose();
    }
  });
});
