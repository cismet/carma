// @vitest-environment jsdom

import * as THREE from "three";
import { describe, expect, it } from "vitest";

describe("tiles3d layer visibility", () => {
  it("can be hidden and shown again without disposing its scene root", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:vitest-maplibre-worker",
    });
    const { buildThreeTilesRuntime } = await import("./three-tiles-runtime");
    const layer = buildThreeTilesRuntime("mesh", "tileset.json", [7.15, 51.25]);
    const root = layer.root;

    layer.setVisible(false);
    expect(layer.root).toBe(root);
    expect(root.visible).toBe(false);

    layer.setVisible(true);
    expect(layer.root).toBe(root);
    expect(root.visible).toBe(true);

    layer.dispose();
  });

  it("applies the declared clay material to meshes in the shared scene", async () => {
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:vitest-maplibre-worker",
    });
    const { buildThreeTilesRuntime } = await import("./three-tiles-runtime");
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
});
