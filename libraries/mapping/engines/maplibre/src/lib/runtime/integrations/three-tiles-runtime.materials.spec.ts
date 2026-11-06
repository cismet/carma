// @vitest-environment jsdom

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { TILE_OUTLINE_FLAG } from "@carma-mapping/engines/threejs";

import { buildThreeTilesRuntime } from "./three-tiles-runtime";
import { TILE_DEPTH_PREPASS_FLAG } from "./three-tiles-runtime-vendor";
import { setTileShadowRole } from "./three-tiles-shadow-role";

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

describe("materials runtime integration", () => {
  it.each([false, true])(
    "keeps layer opacity authoritative with shadow full-opacity=%s",
    (fullOpacity) => {
      const layer = buildThreeTilesRuntime(
        "mesh",
        "tileset.json",
        [7.15, 51.25],
        {
          providesTerrain: true,
          shadowBuildingStyle: true,
        }
      );
      const source = new THREE.MeshBasicMaterial({
        map: new THREE.Texture(),
        opacity: 0.4,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), source);
      layer.scene.root.add(mesh);
      layer.scene.setShadowSimulationStyle?.({
        fullOpacity,
        uniformColor: null,
      });
      const material = mesh.material;
      const version = layer.scene.mapStyleProjectionVersion?.();
      layer.appearance.setOpacity(0.25);
      expect(mesh.material).toBe(material);
      expect(material.opacity).toBeCloseTo(fullOpacity ? 0.25 : 0.1);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(layer.scene.mapStyleProjectionVersion?.()).toBeGreaterThan(
        version!
      );

      // Changing shader options must not reset the modal's opacity.
      layer.scene.setShadowSimulationStyle?.({
        fullOpacity,
        uniformColor: "#ffffff",
        uniformColorMix: 0.5,
      });
      expect(material.opacity).toBeCloseTo(fullOpacity ? 0.25 : 0.1);
      layer.appearance.setOpacity(0);
      expect(material.opacity).toBe(0);
      layer.appearance.setOpacity(1);
      expect(material.opacity).toBe(fullOpacity ? 1 : 0.4);
      expect(material.transparent).toBe(!fullOpacity);
      expect(material.depthWrite).toBe(fullOpacity);
      layer.scene.setShadowSimulationStyle?.(null);
      expect(mesh.material).toBe(source);
      expect(source.opacity).toBe(0.4);
      layer.scene.dispose();
    }
  );

  it("blends only the front surface of a translucent tileset", () => {
    const layer = buildThreeTilesRuntime("lod2", "tileset.json", [7.15, 51.25]);
    const roof = new THREE.MeshStandardMaterial({ name: "roof" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), roof);
    layer.scene.root.add(mesh);
    const depthCopies = () =>
      mesh.children.filter(
        (child) => child.userData[TILE_DEPTH_PREPASS_FLAG]
      ) as THREE.Mesh[];

    layer.appearance.setOpacity(0.9);
    expect(roof.depthWrite).toBe(false);
    expect(depthCopies()).toHaveLength(1);
    const [twin] = depthCopies();
    const depth = twin.material as THREE.Material;
    expect(twin.geometry).toBe(mesh.geometry);
    expect(twin.castShadow).toBe(false);
    expect(depth).not.toBe(roof);
    expect(depth.colorWrite).toBe(false);
    expect(depth.depthWrite).toBe(true);
    expect(depth.transparent).toBe(false);
    expect(depth.visible).toBe(true);
    layer.appearance.setOpacity(0.5);
    expect(depthCopies()).toEqual([twin]);

    // A hidden retained parent must not write depth through its copy, and
    // the copy never becomes a shadow caster.
    setTileShadowRole(mesh, { receiver: false, caster: true });
    expect(twin.castShadow).toBe(false);
    expect(depth.depthWrite).toBe(false);
    setTileShadowRole(mesh, { receiver: true, caster: true });
    expect(depth.depthWrite).toBe(true);

    const disposed = vi.fn();
    depth.addEventListener("dispose", disposed);
    layer.appearance.setOpacity(1);
    expect(depthCopies()).toHaveLength(0);
    expect(disposed).toHaveBeenCalled();
    expect(roof.depthWrite).toBe(true);

    // Unloading a tile disposes its materials, and with them the copy.
    layer.appearance.setOpacity(0.9);
    expect(depthCopies()).toHaveLength(1);
    roof.dispose();
    expect(depthCopies()).toHaveLength(0);
    layer.scene.dispose();
  });

  it("keeps a surface that blends by design out of the depth copy", () => {
    const layer = buildThreeTilesRuntime("lod2", "tileset.json", [7.15, 51.25]);
    const glass = new THREE.MeshStandardMaterial({
      opacity: 0.5,
      transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), glass);
    layer.scene.root.add(mesh);
    layer.appearance.setOpacity(0.9);
    const [twin] = mesh.children as THREE.Mesh[];
    expect((twin.material as THREE.Material).visible).toBe(false);
    layer.scene.dispose();
  });

  it("applies the declared clay material to meshes in the shared scene", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    layer.scene.root.add(mesh);

    layer.appearance.setClayMaterial({
      color: "#d8d1c4",
      roughness: 0.7,
      metalness: 0.1,
    });
    layer.appearance.setWhiteShading(true);

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

    layer.scene.dispose();
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
    layer.scene.root.add(mesh);

    layer.appearance.setWhiteShading(false);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);

    layer.appearance.setOutlineVisible(false);
    expect(outline.visible).toBe(false);
    layer.appearance.setOutlineVisible(true);
    expect(outline.visible).toBe(true);

    layer.scene.dispose();
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
    layer.scene.root.add(mesh);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
      uniformColorMix: 0.35,
      textureSaturation: 0.4,
    });

    expect(mesh.material).toBe(sourceMaterial);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(sourceMaterial.map).not.toBeNull();
    expect(sourceMaterial.opacity).toBe(1);
    expect(sourceMaterial.transparent).toBe(false);
    expect(sourceMaterial.depthWrite).toBe(true);
    expect(sourceMaterial.shadowSide).toBe(THREE.DoubleSide);
    // Outlines follow the style's `outline` alone, shadow mode does not hide them.
    expect(outline.visible).toBe(true);

    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as Parameters<typeof sourceMaterial.onBeforeCompile>[0];
    sourceMaterial.onBeforeCompile(
      shader,
      {} as Parameters<typeof sourceMaterial.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowUniformColorMix.value).toBe(0.35);
    expect(uniforms.uShadowTextureSaturation.value).toBe(0.4);
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(false);
    expect(
      (uniforms.uShadowUniformColor.value as THREE.Color).getHexString()
    ).toBe("d8d1c4");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(");
    expect(shader.fragmentShader).toContain("shadowTextureLuma");

    layer.scene.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.opacity).toBe(0.4);
    expect(sourceMaterial.transparent).toBe(true);
    expect(sourceMaterial.depthWrite).toBe(false);
    expect(sourceMaterial.side).toBe(THREE.DoubleSide);
    expect(sourceMaterial.shadowSide).toBeNull();
    expect(uniforms.uShadowTextureSaturation.value).toBe(1);
    expect(outline.visible).toBe(true);

    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: null,
      uniformColorMix: 1,
    });
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.shadowSide).toBe(THREE.DoubleSide);
    expect(uniforms.uShadowUniformColorMix.value).toBe(0);

    layer.scene.setShadowSimulationStyle?.(null);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.scene.dispose();
  });

  it("lights an opted-out unlit mesh while preserving its declared appearance", () => {
    const layer = buildThreeTilesRuntime(
      "mesh",
      "tileset.json",
      [7.15, 51.25],
      {
        providesTerrain: true,
        shadowBuildingStyle: false,
        outline: true,
        colorCorrection: {
          gamma: [1, 1, 1],
          blackPoint: [0, 0, 0],
          whitePoint: [1, 1, 1],
          saturation: 0.7,
        },
      }
    );
    const source = new THREE.MeshBasicMaterial({
      map: new THREE.Texture(),
      color: "#847466",
      opacity: 0.4,
      transparent: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), source);
    const outline = new THREE.LineSegments();
    outline.userData[TILE_OUTLINE_FLAG] = true;
    layer.scene.root.add(mesh, outline);
    layer.scene.setShadowSimulationStyle?.({
      fullOpacity: true,
      uniformColor: "#ffffff",
      uniformColorMix: 1,
      textureSaturation: 0,
      textureColorCorrection: false,
    });
    expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    const lit = mesh.material as unknown as THREE.MeshStandardMaterial;
    expect(lit.map).toBe(source.map);
    expect(lit.color.getHexString()).toBe("847466");
    expect(lit.opacity).toBe(0.4);
    expect(lit.transparent).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.castShadow).toBe(true);
    expect(outline.visible).toBe(true);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <worldpos_vertex>",
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    } as Parameters<typeof lit.onBeforeCompile>[0];
    lit.onBeforeCompile(
      shader,
      {} as Parameters<typeof lit.onBeforeCompile>[1]
    );
    const uniforms = shader.uniforms as Record<string, { value: unknown }>;
    expect(uniforms.uShadowUniformColorMix.value).toBe(0);
    expect(uniforms.uShadowTextureSaturation.value).toBe(0.7);
    expect(uniforms.uShadowTextureColorCorrection.value).toBe(true);
    const dispose = vi.spyOn(lit, "dispose");
    layer.scene.setShadowSimulationStyle?.(null);
    expect(mesh.material).toBe(source);
    expect(dispose).toHaveBeenCalledOnce();
    layer.scene.dispose();
  });
});
