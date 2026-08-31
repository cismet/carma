// @vitest-environment jsdom

import { TilesRenderer } from "3d-tiles-renderer";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { TILE_OUTLINE_FLAG } from "@carma-mapping/engines/threejs";
import { buildThreeTilesRuntime } from "./three-tiles-runtime";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

describe("three tiles runtime styling", () => {
  it("uses one cache ceiling for tile admission and eviction", () => {
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
    const cacheBudgetBytes = 32 * 1024 ** 2;
    const cacheOverflowBytes = 64 * 1024 ** 2;
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25], {
      cacheBudgetBytes,
      cacheOverflowBytes,
      providesTerrain: true,
      shadowBuildingStyle: true,
    });
    const camera = new THREE.PerspectiveCamera();

    layer.onAdd?.(map);
    layer.update({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(renderer?.lruCache.minBytesSize).toBe(cacheBudgetBytes);
    expect(renderer?.lruCache.maxBytesSize).toBe(
      cacheBudgetBytes + cacheOverflowBytes
    );
    expect(renderer?.lruCache.minSize).toBe(6_000);
    expect(renderer?.lruCache.maxSize).toBe(8_000);

    layer.setShadowSimulationStyle({
      fullOpacity: true,
      uniformColor: null,
    });
    expect(renderer?.lruCache.minBytesSize).toBe(Number.POSITIVE_INFINITY);
    expect(renderer?.lruCache.maxBytesSize).toBe(Number.POSITIVE_INFINITY);
    expect(renderer?.lruCache.minSize).toBe(Number.POSITIVE_INFINITY);
    expect(renderer?.lruCache.maxSize).toBe(Number.POSITIVE_INFINITY);

    layer.setShadowSimulationStyle(null);
    expect(renderer?.lruCache.minBytesSize).toBe(cacheBudgetBytes);
    expect(renderer?.lruCache.maxBytesSize).toBe(
      cacheBudgetBytes + cacheOverflowBytes
    );
    expect(renderer?.lruCache.minSize).toBe(6_000);
    expect(renderer?.lruCache.maxSize).toBe(8_000);

    layer.dispose();
    updateSpy.mockRestore();
  });

  it("keeps the active shadow camera registered across refits and movement", () => {
    const updateSpy = vi
      .spyOn(TilesRenderer.prototype, "update")
      .mockImplementation(() => undefined);
    const setCameraSpy = vi
      .spyOn(TilesRenderer.prototype, "setCamera")
      .mockImplementation(() => undefined);
    const deleteCameraSpy = vi
      .spyOn(TilesRenderer.prototype, "deleteCamera")
      .mockImplementation(() => undefined);
    const setResolutionSpy = vi
      .spyOn(TilesRenderer.prototype, "setResolution")
      .mockImplementation(() => undefined);
    const handlers = new Map<string, () => void>();
    const map = {
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    } as unknown as MaplibreMap;
    const layer = buildThreeTilesRuntime("lod2", "tileset.json", [7.15, 51.25]);
    const viewCamera = new THREE.PerspectiveCamera();
    const shadowCamera = new THREE.OrthographicCamera();

    layer.onAdd?.(map);
    const tilesGroup = layer.root.children[0]?.children[0];
    expect(tilesGroup).toBeDefined();
    tilesGroup?.add(new THREE.Group());
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 2048, height: 2048 },
    });
    layer.update({
      map,
      renderCamera: viewCamera,
      lodCamera: viewCamera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });

    expect(setCameraSpy).toHaveBeenCalledWith(shadowCamera);
    deleteCameraSpy.mockClear();
    setResolutionSpy.mockClear();

    shadowCamera.position.x = 2;
    shadowCamera.updateMatrixWorld(true);
    layer.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 4096, height: 2048 },
    });
    handlers.get("movestart")?.();

    expect(deleteCameraSpy).not.toHaveBeenCalled();
    expect(setResolutionSpy).toHaveBeenCalledWith(shadowCamera, 800, 600);

    layer.setShadowView(null);
    expect(deleteCameraSpy).toHaveBeenCalledOnce();
    expect(deleteCameraSpy).toHaveBeenCalledWith(shadowCamera);
    layer.dispose();
    updateSpy.mockRestore();
    setCameraSpy.mockRestore();
    deleteCameraSpy.mockRestore();
    setResolutionSpy.mockRestore();
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
    layer.root.add(mesh);

    expect(layer.providesTerrain).toBe(true);
    expect(layer.getRequestDemand()).toBe(1);
    layer.setVisible(false);
    expect(layer.root.visible).toBe(false);
    expect(layer.getRequestDemand()).toBe(0);
    layer.setVisible(true);
    layer.setHeightOffset(12);
    expect(layer.root.children[0].position.y).toBe(12);
    layer.setClayColor("#abcdef");
    layer.setWhiteShading(true);
    layer.setWireframe(true);
    expect((mesh.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
    layer.setTileBoundsVisible(true);
    layer.setCacheBudget(1024);
    layer.setRequestConcurrency(2);
    layer.dispose();
  });

  it("derives the visible elevation range from model geometry", () => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(20, 10, 20),
      new THREE.MeshStandardMaterial()
    );
    model.position.y = 150;
    const forEachLoadedModelSpy = vi
      .spyOn(TilesRenderer.prototype, "forEachLoadedModel")
      .mockImplementation((callback) => {
        callback(model, {
          engineData: {
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

    layer.onAdd?.(map);
    const range = layer.getViewElevationRange(camera);

    expect(range?.[0]).toBeCloseTo(145);
    expect(range?.[1]).toBeCloseTo(155);

    forEachLoadedModelSpy.mockRestore();
    layer.dispose();
    model.geometry.dispose();
    (model.material as THREE.Material).dispose();
  });

  it("keeps the panorama and frustum projector shader path available", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.root.add(mesh);
    layer.setWhiteShading(true);
    const material = mesh.material as THREE.MeshStandardMaterial;
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: "#include <common>\n#include <dithering_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];

    layer.setProjector({
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

    layer.setProjector({
      kind: "frustum",
      viewProj: new THREE.Matrix4(),
      texture: new THREE.Texture(),
      opacity: 0.8,
    });
    expect(uniforms.uProjKind.value).toBe(2);

    layer.setProjector(null);
    expect(uniforms.uProjKind.value).toBe(0);
    expect(uniforms.tProj.value).toBeNull();
    layer.dispose();
  });

  it("applies the declared clay material to meshes in the shared scene", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    layer.root.add(mesh);

    layer.setClayMaterial({
      color: "#d8d1c4",
      roughness: 0.7,
      metalness: 0.1,
    });
    layer.setWhiteShading(true);

    const material: THREE.Material = mesh.material;
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
    if (!(material instanceof THREE.MeshStandardMaterial)) {
      throw new Error("clay shader did not replace the source material");
    }
    expect(material.color.getHexString()).toBe("d8d1c4");
    expect(material.roughness).toBe(0.7);
    expect(material.metalness).toBe(0.1);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.dispose();
  });

  it("keeps native tile meshes shadeable and controls their declared outlines", () => {
    const layer = buildThreeTilesRuntime("lod2", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    const outline = new THREE.LineSegments();
    outline.userData[TILE_OUTLINE_FLAG] = true;
    mesh.add(outline);
    layer.root.add(mesh);

    layer.setWhiteShading(false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.setOutlineVisible(false);
    expect(outline.visible).toBe(false);
    layer.setOutlineVisible(true);
    expect(outline.visible).toBe(true);

    layer.dispose();
  });

  it("fades textured tiles to the shadow color without replacing their material", () => {
    const layer = buildThreeTilesRuntime(
      "lod2",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: "#847466",
      map: new THREE.Texture(),
      opacity: 0.4,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sourceMaterial);
    const outline = new THREE.LineSegments();
    outline.userData[TILE_OUTLINE_FLAG] = true;
    mesh.add(outline);
    layer.root.add(mesh);

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.35,
    });

    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.map).not.toBeNull();
    expect(sourceMaterial.opacity).toBe(1);
    expect(sourceMaterial.transparent).toBe(false);
    expect(sourceMaterial.depthWrite).toBe(true);
    expect(sourceMaterial.shadowSide).toBe(THREE.BackSide);
    expect(outline.visible).toBe(false);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <dithering_fragment>",
    } as Parameters<typeof sourceMaterial.onBeforeCompile>[0];
    sourceMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof sourceMaterial.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowUniformColorMix.value).toBe(0.35);
    expect(
      (uniforms.uShadowUniformColor.value as THREE.Color).getHexString()
    ).toBe("d8d1c4");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(");

    layer.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.opacity).toBe(0.4);
    expect(sourceMaterial.transparent).toBe(true);
    expect(sourceMaterial.depthWrite).toBe(false);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(outline.visible).toBe(true);

    layer.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
      uniformColorMix: 1,
    });
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.shadowSide).toBe(THREE.BackSide);
    expect(uniforms.uShadowUniformColorMix.value).toBe(0);

    layer.setShadowSimulationStyle?.(null);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.dispose();
  });
});
