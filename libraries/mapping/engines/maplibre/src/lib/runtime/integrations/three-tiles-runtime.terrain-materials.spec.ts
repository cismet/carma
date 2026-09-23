// @vitest-environment jsdom

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

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

describe("terrain materials runtime integration", () => {
  it("keeps unclassified separated LoD2 surfaces visible from both sides", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-city",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const roofMaterial = new THREE.MeshStandardMaterial({
      name: "roof",
      side: THREE.DoubleSide,
    });
    const wallMaterial = new THREE.MeshStandardMaterial({
      name: "wall",
      side: THREE.DoubleSide,
    });
    const shellMaterial = new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
    });
    layer.scene.root.add(
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), roofMaterial),
      new THREE.Mesh(new THREE.PlaneGeometry(1, 1), wallMaterial),
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shellMaterial)
    );

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

    expect(roofMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(wallMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(shellMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);
    expect(shellMaterial.side).toBe(THREE.DoubleSide);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(roofMaterial.shadowSide).toBeNull();
    expect(wallMaterial.shadowSide).toBeNull();
    expect(shellMaterial.shadowSide).toBeNull();
    expect(roofMaterial.side).toBe(THREE.DoubleSide);
    expect(wallMaterial.side).toBe(THREE.DoubleSide);

    layer.scene.dispose();
  });

  it("uses the regular lit tile material for unlit terrain textures", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        providesTerrain: true,
        shadowBuildingStyle: true,
        colorCorrection: {
          gamma: [1.25, 1.25, 1.23],
          blackPoint: [0, 0, 0],
          whitePoint: [0.9, 0.9, 0.92],
          saturation: 1,
        },
      }
    );
    const sourceMaterial = new THREE.MeshBasicMaterial({
      color: "#847466",
      map: new THREE.Texture(),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sourceMaterial);
    const normals = mesh.geometry.getAttribute("normal");
    normals.setXYZ(0, 0.5, -0.5, 0.5);
    layer.scene.root.add(mesh);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });

    expect(mesh.material).not.toBe(sourceMaterial);
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const shadowMaterial =
      mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(shadowMaterial.map).toBe(sourceMaterial.map);
    expect(shadowMaterial.color.getHexString()).toBe("847466");
    expect(shadowMaterial.roughness).toBe(1);
    expect(shadowMaterial.metalness).toBe(0);
    expect(shadowMaterial.normalMap).toBeNull();
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(shadowMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(normals.getX(0)).toBeCloseTo(0.5);
    expect(normals.getY(0)).toBeCloseTo(-0.5);
    expect(normals.getZ(0)).toBeCloseTo(0.5);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as Parameters<typeof shadowMaterial.onBeforeCompile>[0];
    shadowMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof shadowMaterial.onBeforeCompile>[1]
    );
    expect(shader.fragmentShader).not.toContain("flatTextureShadow");
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(shader.fragmentShader.indexOf("shadowTextureLuma")).toBeGreaterThan(
      shader.fragmentShader.indexOf("#include <color_fragment>")
    );
    expect(shader.fragmentShader.indexOf("shadowTextureLuma")).toBeLessThan(
      shader.fragmentShader.indexOf("#include <lights_fragment_begin>")
    );
    expect(shader.vertexShader).not.toContain("flatTextureNormalBias");

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.75,
      textureSaturation: 0.8,
      textureColorCorrection: true,
    });
    expect(mesh.material).toBe(shadowMaterial);
    expect(mesh.material).not.toBe(sourceMaterial);
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(true);
    expect(
      (uniforms.uShadowTextureGamma.value as THREE.Vector3).toArray()
    ).toEqual([1.25, 1.25, 1.23]);
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.75,
      textureSaturation: 0.8,
      textureColorCorrection: false,
    });
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(mesh.material).toBe(shadowMaterial);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.scene.dispose();
  });

  it("projects the map style onto terrain but not separated LoD2 surfaces", () => {
    const layer = buildThreeTilesRuntime(
      "lod2-native",
      "tileset.json",
      [7.15, 51.25],
      { providesTerrain: true, shadowBuildingStyle: true }
    );
    const parent = new THREE.Group();
    const buildSurface = (name: string) => {
      const material = new THREE.MeshLambertMaterial();
      material.name = name;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      parent.add(mesh);
      return mesh;
    };
    const terrain = buildSurface("terrain");
    const roof = buildSurface("roof");
    const wall = buildSurface("wall");
    layer.scene.root.add(parent);

    const receivesMapStyleBeforeTileStyling =
      layer.scene.receivesMapStyleTexture;
    expect(typeof receivesMapStyleBeforeTileStyling).toBe("function");
    expect(layer.scene.mapStyleProjectionBlend).toBe("overlay");
    expect(
      (
        receivesMapStyleBeforeTileStyling as (
          material: THREE.Material
        ) => boolean
      )(terrain.material as THREE.Material)
    ).toBe(true);
    expect(
      (
        receivesMapStyleBeforeTileStyling as (
          material: THREE.Material
        ) => boolean
      )(roof.material as THREE.Material)
    ).toBe(false);

    const initialVersion = layer.scene.mapStyleProjectionVersion?.() ?? -1;
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    const receivesMapStyle = layer.scene.receivesMapStyleTexture;

    expect(typeof receivesMapStyle).toBe("function");
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        terrain.material as THREE.Material
      )
    ).toBe(true);
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        roof.material as THREE.Material
      )
    ).toBe(false);
    expect(
      (receivesMapStyle as (material: THREE.Material) => boolean)(
        wall.material as THREE.Material
      )
    ).toBe(false);
    expect(layer.scene.mapStyleProjectionVersion?.()).toBeGreaterThan(
      initialVersion
    );
    const styledVersion = layer.scene.mapStyleProjectionVersion?.();
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
    });
    expect(layer.scene.mapStyleProjectionVersion?.()).toBe(styledVersion);

    layer.scene.dispose();
  });
});
