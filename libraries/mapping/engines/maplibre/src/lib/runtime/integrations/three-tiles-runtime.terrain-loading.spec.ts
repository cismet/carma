// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";

import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { setSharedThreeTerrainLoading } from "./shared-three-terrain-registry";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";

const MIB = 1024 ** 2;

type BytesRenderer = {
  calculateBytesUsed: (tile: unknown, scene: THREE.Object3D | null) => number;
};

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("terrain loading runtime integration", () => {
  it("loads a terrain-providing mesh while fallback terrain is still loading", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        providesTerrain: true,
      }
    );
    const camera = new THREE.PerspectiveCamera();
    setSharedThreeTerrainLoading(map, "fallback-terrain", true);

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(0);
    expect(layer.scene.hasRenderableContent?.()).toBe(false);
    const tilesGroup = layer.scene.root.children[0]?.children[0];
    tilesGroup?.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial()
      )
    );
    expect(layer.scene.hasRenderableContent?.()).toBe(true);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    layer.scene.dispose();
    updateSpy.mockRestore();
  });

  it("keeps progressive visible-content slots while terrain is loading", () => {
    let renderer: TilesRenderer | undefined;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function (this: TilesRenderer) {
        renderer = this;
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime(
      "buildings",
      "tileset.json",
      [7.15, 51.25]
    );
    const camera = new THREE.PerspectiveCamera();
    setSharedThreeTerrainLoading(map, "fallback-terrain", true);

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
      localFrame: {
        lngLat: [7.15, 51.25] as const,
        revision: 1,
        sceneFromLocal: new THREE.Matrix4(),
        sceneFromLocalRotation: new THREE.Matrix4(),
        referenceLngLat: [7.15, 51.25] as const,
        sceneFromLocalReference: new THREE.Matrix4(),
        referenceToCurrent: new THREE.Matrix4(),
        currentToReference: new THREE.Matrix4(),
      },
    });

    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBe(8);

    setSharedThreeTerrainLoading(map, "fallback-terrain", false);
    expect(renderer?.downloadQueue.maxJobsPerOrigin).toBeGreaterThan(1);
    layer.scene.dispose();
    updateSpy.mockRestore();
  });
});
