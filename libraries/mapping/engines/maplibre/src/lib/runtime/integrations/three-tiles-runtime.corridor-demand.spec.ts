// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("atomic mesh corridor loader demand", () => {
  it("loads split siblings and the stricter follow-up caster cut before publishing their receiver family", () => {
    let renderer: TilesRenderer;
    const update = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this;
        this.frameCount += 1;
      });
    const queued = vi
      .spyOn(TilesRenderer.prototype, "queueTileForDownload")
      .mockImplementation(() => {});
    const nativeError = vi
      .spyOn(TilesRenderer.prototype, "calculateTileViewErrorWithPlugin")
      .mockImplementation((_tile, target) => {
        target.inView = false;
        target.error = Number.POSITIVE_INFINITY;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      isMoving: () => false,
    } as unknown as MaplibreMap;
    const runtime = buildThreeTilesRuntime(
      "staged",
      "https://example.test/mesh/tileset.json",
      [7.2, 51.2],
      { providesTerrain: true }
    );
    const camera = new THREE.PerspectiveCamera();
    const frame = {
      map,
      renderCamera: camera,
      lodCamera: camera,
      viewport: new THREE.Vector2(800, 600),
      lookTarget: new THREE.Vector3(),
    };
    runtime.onAdd?.(map);
    runtime.setErrorTarget(1);
    runtime.update(frame);
    const nativePlacement = renderer!.group.matrixWorld.clone().invert();
    const makeTile = (
      id: string,
      minX: number,
      maxX: number,
      z: number,
      error: number,
      main: boolean,
      parent: Tile | null = null
    ): Tile => {
      const box = new THREE.Box3(
        new THREE.Vector3(minX, -1, z - 1),
        new THREE.Vector3(maxX, 1, z + 1)
      );
      return {
        content: { uri: `${id}.b3dm` },
        geometricError: error,
        parent,
        children: [],
        refine: "REPLACE",
        internal: {
          hasContent: true,
          hasRenderableContent: true,
          loadingState: 4,
          basePath: "https://example.test/mesh",
          depth: parent ? 1 : 0,
        },
        traversal: { error, inFrustum: main },
        engineData: {
          scene: new THREE.Group(),
          boundingVolume: {
            getAABB: (target: THREE.Box3) =>
              target.copy(box).applyMatrix4(nativePlacement),
            getOBB: (target: THREE.Box3, transform: THREE.Matrix4) => {
              target.copy(box);
              transform.copy(nativePlacement);
            },
            getSphere: (target: THREE.Sphere) => box.getBoundingSphere(target),
            intersectsFrustum: () => main,
          },
        },
      } as unknown as Tile;
    };
    const root = makeTile("root", -20, 20, -80, 64, true);
    root.internal.hasContent = false;
    root.internal.hasRenderableContent = false;
    const rootBox = new THREE.Box3(
      new THREE.Vector3(-20, -20, -120),
      new THREE.Vector3(20, 20, 0)
    );
    Object.assign(root.engineData.boundingVolume, {
      getAABB: (target: THREE.Box3) =>
        target.copy(rootBox).applyMatrix4(nativePlacement),
      getOBB: (target: THREE.Box3, transform: THREE.Matrix4) => {
        target.copy(rootBox);
        transform.copy(nativePlacement);
      },
    });
    const reference = makeTile("reference4", -2, 1, -100, 4, true, root);
    const receiver = makeTile("receiver16", 0, 10, -100, 16, true, root);
    const left = makeTile("receiver-left8", 0, 5, -100, 8, true, receiver);
    const right = makeTile("receiver-right8", 5, 10, -100, 8, true, receiver);
    right.internal.loadingState = 0;
    const caster = makeTile("caster16", 6, 10, -50, 16, false, root);
    const fineCaster = makeTile("caster8", 6, 10, -50, 8, false, caster);
    fineCaster.internal.loadingState = 0;
    receiver.children = [left, right];
    caster.children = [fineCaster];
    root.children = [reference, receiver, caster];
    Object.assign(renderer!, { rootTileset: { root } });
    for (const tile of [root, reference, receiver, left, caster])
      renderer!.lruCache.add(tile, () => {});
    const sun = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 500);
    sun.position.set(0, 0, 100);
    sun.lookAt(0, 0, 0);
    sun.updateMatrixWorld(true);
    runtime.setShadowView({
      camera: sun,
      shadowMapSize: { width: 1024, height: 1024 },
    });
    const loaded = (tile: Tile) => {
      tile.internal.loadingState = 4;
      renderer!.lruCache.add(tile, () => {});
      renderer!.dispatchEvent({
        type: "load-model",
        scene: tile.engineData.scene,
        tile,
        url: `https://example.test/mesh/${tile.content.uri}`,
      });
    };
    try {
      runtime.update(frame);
      expect(renderer!.visibleTiles.has(reference)).toBe(true);
      expect(renderer!.visibleTiles.has(receiver)).toBe(false);
      expect(renderer!.visibleTiles.has(right)).toBe(false);
      queued.mockClear();
      // Its own coarse budget permits the parent, but the reference receiver
      // forces that shared parent to split. The sibling is a real dependency.
      renderer!.queueTileForDownload(right);
      expect(queued).toHaveBeenCalledWith(right);
      queued.mockClear();
      renderer!.queueTileForDownload(fineCaster);
      expect(queued).not.toHaveBeenCalled();

      loaded(right);
      runtime.update(frame);
      // The proof now selects the two 8px receiver children. The loader must
      // see their stricter demand although neither may publish before caster8.
      expect(renderer!.visibleTiles.has(right)).toBe(false);
      queued.mockClear();
      renderer!.queueTileForDownload(fineCaster);
      expect(queued).toHaveBeenCalledWith(fineCaster);
      loaded(fineCaster);
      runtime.update(frame);
      expect(renderer!.visibleTiles.has(right)).toBe(true);
      expect(renderer!.visibleTiles.has(fineCaster)).toBe(true);
      expect(renderer!.visibleTiles.has(receiver)).toBe(false);
      expect(renderer!.visibleTiles.has(caster)).toBe(false);
    } finally {
      runtime.dispose();
      nativeError.mockRestore();
      queued.mockRestore();
      update.mockRestore();
    }
  });
});
