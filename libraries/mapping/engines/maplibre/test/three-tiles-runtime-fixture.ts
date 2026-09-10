import { TilesRenderer } from "3d-tiles-renderer";
import type { Tile } from "3d-tiles-renderer/core";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { vi } from "vitest";
import { buildThreeTilesRuntime } from "../src/lib/runtime/integrations/three-tiles-runtime";

/** Metadata/decoded-payload fixture; no network or GPU. Spatial roles are explicit
 * and native/local transforms remain coherent. Loading state matches scene data.
 */
export const createMeshCorridorFixture = (
  rotation = 0,
  providesTerrain = true
) => {
  let renderer!: TilesRenderer;
  const errors = new WeakMap<Tile, { inView: boolean; error: number }>();
  vi.spyOn(TilesRenderer.prototype, "update").mockImplementation(function () {
    renderer = this;
    this.frameCount += 1;
    this.visibleTiles.clear();
  });
  for (const method of [
    "calculateTileViewError",
    "calculateTileViewErrorWithPlugin",
  ] as const) {
    vi.spyOn(TilesRenderer.prototype, method).mockImplementation(
      (tile, target) => {
        Object.assign(
          target,
          errors.get(tile) ?? { inView: false, error: Infinity },
          { distanceFromCamera: 100 }
        );
      }
    );
  }
  const queued = vi
    .spyOn(TilesRenderer.prototype, "queueTileForDownload")
    .mockImplementation(() => {});
  const map = {
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    isMoving: () => false,
  } as unknown as MaplibreMap;
  const runtime = buildThreeTilesRuntime(
    "corridor",
    "https://example.test/mesh/tileset.json",
    [7.2, 51.2],
    { providesTerrain }
  );
  const camera = new THREE.PerspectiveCamera();
  const frame = {
    map,
    renderCamera: camera,
    lodCamera: camera,
    viewport: new THREE.Vector2(800, 600),
    lookTarget: new THREE.Vector3(),
  };
  runtime.scene.onAdd?.(map);
  runtime.loading.setErrorTarget(1);
  runtime.scene.update(frame);
  renderer.group.rotation.z = rotation;
  renderer.group.updateMatrixWorld(true);
  const placement = renderer.group.matrixWorld.clone().invert();
  const tile = (
    id: string,
    minX: number,
    maxX: number,
    z: number,
    error: number,
    inView: boolean,
    parent: Tile | null = null,
    halfDepth = 1
  ): Tile => {
    const world = new THREE.Box3(
      new THREE.Vector3(minX, -10, z - halfDepth),
      new THREE.Vector3(maxX, 10, z + halfDepth)
    );
    const native = world.clone().applyMatrix4(placement);
    const result = {
      content: { uri: `${id}.b3dm` },
      geometricError: error,
      parent,
      children: [],
      refine: "REPLACE",
      internal: {
        hasContent: true,
        hasRenderableContent: true,
        loadingState: 0,
        basePath: "https://example.test/mesh",
        depth: parent ? parent.internal.depth + 1 : 0,
      },
      traversal: { error, inFrustum: inView, distanceFromCamera: 100 },
      engineData: {
        boundingVolume: {
          getAABB: (out: THREE.Box3) => out.copy(native),
          getOBB: (out: THREE.Box3, transform: THREE.Matrix4) => {
            out.copy(world);
            transform.copy(placement);
          },
          getSphere: (out: THREE.Sphere) => native.getBoundingSphere(out),
          distanceToPoint: (point: THREE.Vector3) =>
            native.distanceToPoint(point),
          intersectsFrustum: () => inView,
        },
      },
    } as unknown as Tile;
    errors.set(result, { error, inView });
    return result;
  };
  const load = (value: Tile) => {
    value.internal.loadingState = 4;
    value.engineData.scene ??= new THREE.Group();
    renderer.lruCache.add(value, () => {});
    renderer.dispatchEvent({
      type: "load-model",
      scene: value.engineData.scene,
      tile: value,
      url: `https://example.test/mesh/${value.content.uri}`,
    });
  };
  const root = tile("root", -200, 200, -75, 64, true, null, 100);
  root.internal.hasContent = false;
  root.internal.hasRenderableContent = false;
  root.internal.loadingState = 4;
  const receiver = tile("receiver16", -10, 10, -100, 16, true, root);
  const caster = tile("caster16", -10, 10, -50, 16, false, root);
  root.children = [receiver, caster];
  Object.assign(renderer, { rootTileset: { root } });
  load(receiver);
  load(caster);
  const sun = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 500);
  sun.position.set(0, 0, 100);
  sun.lookAt(0, 0, 0);
  const setSun = () => {
    sun.updateMatrixWorld(true);
    runtime.scene.setShadowView({
      camera: sun,
      shadowMapSize: { width: 1024, height: 1024 },
    });
  };
  setSun();
  const receiverBox = new THREE.Box3(
    new THREE.Vector3(-10, -10, -101),
    new THREE.Vector3(10, 10, -99)
  );
  return {
    renderer,
    runtime,
    frame,
    root,
    receiver,
    caster,
    sun,
    tile,
    load,
    queued,
    setSun,
    setTileError: (value: Tile, error: number) => {
      errors.set(value, { ...errors.get(value)!, error });
    },
    receiverBox,
    corridor: receiverBox.clone().expandByVector(new THREE.Vector3(0, 0, 51)),
    update: () => runtime.scene.update(frame),
    visibleIds: () =>
      [...renderer.visibleTiles]
        .map((value) => value.content.uri!.replace(".b3dm", ""))
        .sort(),
    dispose: () => runtime.scene.dispose(),
  };
};
