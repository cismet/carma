// @vitest-environment jsdom
import { TilesRenderer } from "3d-tiles-renderer";

import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import { debugTilesRuntimes } from "./three-tiles-runtime-debug";

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

describe("diagnostics runtime integration", () => {
  it("toggles diagnostics without replacing the runtime or its loaded tiles", () => {
    const runtime = buildThreeTilesRuntime(
      "telemetry-toggle",
      "mesh.json",
      [7.2, 51.2]
    );
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    runtime.scene.onAdd?.(map);
    try {
      runtime.debug.setDiagnosticsEnabled(true);
      const state = [...(debugTilesRuntimes() ?? [])].find(
        (entry) => (entry as { layerId: string }).layerId === "telemetry-toggle"
      ) as { tiles: TilesRenderer; options: { diagnostics: boolean } };
      expect(state).toBeDefined();
      const tiles = state.tiles;
      runtime.debug.setDiagnosticsEnabled(false);
      expect(debugTilesRuntimes()?.has(state)).toBe(false);
      expect(state.options.diagnostics).toBe(false);
      runtime.debug.setTelemetryEnabled(true);
      expect(debugTilesRuntimes()?.has(state)).toBe(true);
      expect(state.tiles).toBe(tiles);
      const telemetry = state as typeof state & {
        tileBoundsVisible: boolean;
        options: { tileTelemetry: boolean };
      };
      expect(telemetry.options.tileTelemetry).toBe(true);
      expect(telemetry.tileBoundsVisible).toBe(false);
      runtime.debug.setTelemetryEnabled(false);
      expect(telemetry.options.tileTelemetry).toBe(false);
    } finally {
      runtime.scene.dispose?.();
    }
  });

  it("keeps concern APIs stable and exposes only the adapter to the scene", () => {
    const runtime = buildThreeTilesRuntime("scoped", "mesh.json", [7.2, 51.2]);
    const { scene, appearance, loading, placement, debug } = runtime;
    expect(Object.keys(runtime).sort()).toEqual(
      ["scene", "appearance", "loading", "placement", "debug"].sort()
    );
    expect(scene.setErrorTarget).toBe(loading.setErrorTarget);
    expect(scene.setCacheBudget).toBe(loading.setCacheBudget);
    expect(scene.setTileBoundsVisible).toBe(debug.setTileBoundsVisible);
    const update = scene.update;
    appearance.setOpacity(0.5);
    appearance.setClayColor("#abcdef");
    expect(runtime.scene).toBe(scene);
    expect(runtime.appearance).toBe(appearance);
    expect(runtime.loading).toBe(loading);
    expect(runtime.placement).toBe(placement);
    expect(runtime.debug).toBe(debug);
    expect(scene.update).toBe(update);
    scene.dispose();
  });

  it("exposes the active 3D tile volumes in shared scene coordinates", () => {
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
    renderer!.activeTiles.add({
      content: { uri: "building.b3dm" },
      internal: { depth: 3 },
      engineData: {
        scene: new THREE.Group(),
        boundingVolume: {
          getAABB: (target: THREE.Box3) =>
            target.set(
              new THREE.Vector3(-2, 10, -4),
              new THREE.Vector3(2, 30, 4)
            ),
        },
      },
    } as never);

    const volumes = layer.scene.getActiveTileVolumes?.() ?? [];

    expect(volumes).toHaveLength(1);
    expect(volumes[0]).toMatchObject({
      id: "tileset.json#:building.b3dm",
      kind: "3d-tile",
      sourceId: "tileset.json",
    });
    expect(volumes[0]?.minimum.every(Number.isFinite)).toBe(true);
    expect(volumes[0]?.maximum.every(Number.isFinite)).toBe(true);

    const tile = [...renderer!.activeTiles][0];
    const model = tile.engineData.scene!;
    const surface = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 8));
    surface.position.set(1, 200, 3);
    model.add(surface);
    const loadedVolumes = layer.scene.getActiveTileVolumes?.() ?? [];
    // Spatial search follows tileset metadata, not payload vertex traversal.
    // Adding geometry must not replace the stable declared bounding volume.
    expect(loadedVolumes[0].minimum).toEqual(volumes[0].minimum);
    expect(loadedVolumes[0].maximum).toEqual(volumes[0].maximum);
    surface.geometry.dispose();
    (surface.material as THREE.Material).dispose();

    layer.scene.dispose();
    updateSpy.mockRestore();
  });

  it("preserves the runtime controls used by the pointcloud playground", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true }
    );
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.scene.root.add(mesh);

    expect(layer.scene.providesTerrain).toBe(true);
    expect(layer.loading.getRequestDemand()).toBe(1);
    layer.appearance.setVisible(false);
    expect(layer.scene.root.visible).toBe(false);
    expect(layer.loading.getRequestDemand()).toBe(0);
    layer.appearance.setVisible(true);
    layer.placement.setHeightOffset(12);
    expect(layer.scene.root.children[0].position.y).toBe(12);
    layer.appearance.setClayColor("#abcdef");
    layer.appearance.setWhiteShading(true);
    layer.appearance.setWireframe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    expect(mesh.frustumCulled).toBe(true);
    layer.debug.setTileBoundsVisible(true);
    layer.loading.setCacheBudget(1024);
    layer.loading.setRequestConcurrency(2);
    layer.scene.dispose();
  });

  it("derives the visible elevation range from model geometry", () => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(20, 10, 20),
      new THREE.MeshStandardMaterial()
    );
    model.position.y = 150;
    let renderer: TilesRenderer;
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(function () {
        renderer = this;
        renderer.visibleTiles.add({
          engineData: {
            scene: model,
            boundingVolume: {
              getAABB: (target: THREE.Box3) =>
                target.set(
                  new THREE.Vector3(-10_000, -10_000, -10_000),
                  new THREE.Vector3(10_000, 10_000, 10_000)
                ),
            },
          },
        } as never);
      });
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const camera = new THREE.PerspectiveCamera(60, 1, 1, 1_000);
    camera.position.set(0, 150, 100);
    camera.lookAt(0, 150, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    layer.scene.onAdd?.(map);
    layer.scene.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      viewport: new THREE.Vector2(800, 600),
      lookTarget: new THREE.Vector3(),
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
    const range = layer.scene.getViewElevationRange(camera);

    expect(range?.[0]).toBeCloseTo(145);
    expect(range?.[1]).toBeCloseTo(155);

    const walkSpy = vi.spyOn(model, "traverse");
    for (let i = 0; i < 100; i += 1) {
      expect(layer.scene.getViewElevationRange(camera)).toEqual(range);
    }
    expect(walkSpy).not.toHaveBeenCalled();
    model.position.y += 10;
    expect(layer.scene.getViewElevationRange(camera)).toEqual([155, 165]);
    // The moved model needs no new walk: its bounds are cached in its own
    // space and only the chain above it is applied per read.
    expect(walkSpy).not.toHaveBeenCalled();
    walkSpy.mockRestore();

    updateSpy.mockRestore();
    layer.scene.dispose();
    model.geometry.dispose();
    (model.material as THREE.Material).dispose();
  });

  it("keeps the panorama and frustum projector shader path available", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.scene.root.add(mesh);
    layer.appearance.setWhiteShading(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: "#include <common>\n#include <dithering_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];

    layer.appearance.setProjector({
      kind: "pano",
      position: new THREE.Vector3(1, 2, 3),
      headingRad: 0.5,
      texture: new THREE.Texture(),
      opacity: 0.7,
    });
    material.onBeforeCompile(
      shader,
      {} as Parameters<typeof material.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uProjKind.value).toBe(1);
    expect(uniforms.uProjOpacity.value).toBe(0.7);
    expect(shader.fragmentShader).toContain("uProjMatrix");

    layer.appearance.setProjector({
      kind: "frustum",
      viewProj: new THREE.Matrix4(),
      texture: new THREE.Texture(),
      opacity: 0.8,
    });
    expect(uniforms.uProjKind.value).toBe(2);

    layer.appearance.setProjector(null);
    expect(uniforms.uProjKind.value).toBe(0);
    expect(uniforms.tProj.value).toBeNull();
    layer.scene.dispose();
  });
});
