// @vitest-environment jsdom

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
  it("preserves the runtime controls used by the pointcloud playground", () => {
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial()
    );
    layer.root.add(mesh);

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

  it("uses opaque outline-free clay for building tiles only during shadow mode", () => {
    const layer = buildThreeTilesRuntime(
      "lod2",
      "tileset.json",
      [7.15, 51.25],
      { shadowBuildingStyle: true }
    );
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: "#847466",
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
    });

    const clayMaterial = mesh.material as THREE.MeshStandardMaterial;
    expect(clayMaterial).not.toBe(sourceMaterial);
    expect(clayMaterial.color.getHexString()).toBe("d8d1c4");
    expect(clayMaterial.opacity).toBe(1);
    expect(clayMaterial.transparent).toBe(false);
    expect(clayMaterial.depthWrite).toBe(true);
    expect(clayMaterial.side).toBe(THREE.FrontSide);
    expect(clayMaterial.shadowSide).toBe(THREE.BackSide);
    expect(outline.visible).toBe(false);

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
    });
    expect(mesh.material).toBe(sourceMaterial);
    expect(sourceMaterial.shadowSide).toBe(THREE.BackSide);

    layer.setShadowSimulationStyle?.(null);
    expect(sourceMaterial.shadowSide).toBeNull();

    layer.dispose();
  });
});
