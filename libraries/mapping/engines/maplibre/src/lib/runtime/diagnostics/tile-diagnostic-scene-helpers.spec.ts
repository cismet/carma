import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { Tile } from "3d-tiles-renderer/core";
import {
  createTileDiagnosticScene,
  type TileDiagnosticSceneOptions,
} from "./tile-diagnostic-scene-helpers";
const options = (): TileDiagnosticSceneOptions => ({
  showTileGeometry: true,
  sceneExtents: "none",
  debugColorMode: "NONE",
  debugBoxBounds: false,
  debugSphereBounds: false,
  debugParentBounds: false,
  debugUnlit: false,
});
describe("library scene diagnostics", () => {
  it("borrows source geometry, removes its listeners and disposes only owned resources", () => {
    const scene = new THREE.Scene(),
      group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(),
      new THREE.MeshBasicMaterial()
    );
    group.add(mesh);
    scene.add(group);
    const sourceDispose = vi.fn();
    mesh.geometry.addEventListener("dispose", sourceDispose);
    const helpers = createTileDiagnosticScene(scene, options, vi.fn());
    helpers.syncLoadedGeometry(group);
    const proxies = scene.getObjectByName("mesh-coverage-loaded-wireframes")!;
    expect((proxies.children[0] as THREE.Mesh).geometry).toBe(mesh.geometry);
    const material = (proxies.children[0] as THREE.Mesh)
      .material as THREE.Material;
    const materialDispose = vi.fn();
    material.addEventListener("dispose", materialDispose);
    helpers.dispose();
    expect(scene.children).toEqual([group]);
    expect(sourceDispose).not.toHaveBeenCalled();
    expect(materialDispose).toHaveBeenCalledTimes(1);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
  it("releases hover geometry when diagnostics are removed", () => {
    const scene = new THREE.Scene(),
      group = new THREE.Group();
    const helpers = createTileDiagnosticScene(scene, options, vi.fn());
    const tile = {
      engineData: {
        boundingVolume: {
          getAABB: (box: THREE.Box3) =>
            box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)),
        },
      },
    } as unknown as Tile;
    helpers.syncHoverHelpers(group, { tile, parent: null, siblings: [] });
    const hover = scene.getObjectByName("mesh-coverage-hover-extents")!;
    const box = hover.children[0] as THREE.Box3Helper,
      dispose = vi.fn();
    box.geometry.addEventListener("dispose", dispose);
    helpers.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });
});
