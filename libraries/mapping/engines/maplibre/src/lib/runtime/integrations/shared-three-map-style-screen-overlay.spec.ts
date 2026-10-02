import { describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector2,
} from "three";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";

describe("map-style screen image ownership", () => {
  it("composes two bounded slots and restores the progressive image when a crop is removed", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const base = new Texture(),
      crop = new Texture(),
      matrix = new Matrix3();
    controller.setScreenOverlay("preview", {
      texture: base,
      viewportToTexture: matrix,
      opacity: 1,
    });
    controller.setScreenOverlay("crop", {
      texture: crop,
      viewportToTexture: matrix,
      opacity: 1,
      priority: 1,
    });
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenTexture0.value).toBe(base);
    expect(uniforms.carmaScreenTexture1.value).toBe(crop);
    expect(controller.screenOverlayMesh.visible).toBe(true);
    controller.setScreenOverlay("crop", null);
    expect(uniforms.carmaScreenTexture0.value).toBe(base);
    expect(uniforms.carmaScreenOpacity1.value).toBe(0);
    controller.setScreenOverlay("preview", null);
    expect(controller.screenOverlayMesh.visible).toBe(false);
    controller.dispose();
  });
  it("stops invalidating an unchanged image transform and copies caller matrices", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture(),
      matrix = new Matrix3(),
      entry = { texture, viewportToTexture: matrix, opacity: 1 };
    controller.setScreenOverlay("preview", entry);
    const epoch = controller.epoch;
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBe(epoch);
    matrix.elements[6] = 0.2;
    expect(
      controller.screenOverlayMesh.material.uniforms.carmaScreenToTexture0.value
        .elements[6]
    ).toBe(0);
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBeGreaterThan(epoch);
    texture.needsUpdate = true;
    const updated = controller.epoch;
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBeGreaterThan(updated);
    controller.dispose();
  });
  it("shares one full-image frame with receivers while a crop uses independent texture UVs", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map([
        [
          "receiver",
          {
            id: "receiver",
            originLngLat: [0, 0] as [number, number],
            root,
            receivesMapStyleTexture: true,
            update: () => undefined,
            dispose: () => undefined,
          },
        ],
      ]),
      new Vector2(1600, 1200)
    );
    const fullImage = new Matrix3().set(0, -1, 1, 1, 0, 0, 0, 0, 1);
    const border = {
      viewportToImage: fullImage,
      imageSize: { width: 800, height: 600 },
      width: 2,
      opacity: 0.9,
      feather: 50,
      featherOpacity: 0.8,
    };
    const preview = {
      texture: new Texture(),
      viewportToTexture: fullImage,
      opacity: 0.5,
      border,
    };
    controller.setScreenOverlay("preview", preview);
    const cropTransform = new Matrix3().set(4, 0, -1, 0, 4, -1, 0, 0, 1);
    controller.setScreenOverlay("crop", {
      texture: new Texture(),
      viewportToTexture: cropTransform,
      opacity: 1,
      priority: 1,
      border,
    });
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenToTexture1.value.equals(cropTransform)).toBe(
      true
    );
    expect(uniforms.carmaScreenToBorderImage.value.equals(fullImage)).toBe(
      true
    );
    expect(uniforms.carmaScreenBorderImageSize.value.toArray()).toEqual([
      800, 600,
    ]);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.45, 50, 0.4,
    ]);

    controller.setEnabled(false);
    controller.capture(new Matrix4(), false);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(
      shader,
      {} as Parameters<typeof material.onBeforeCompile>[1]
    );
    for (const name of [
      "carmaScreenToBorderImage",
      "carmaScreenBorderImageSize",
      "carmaScreenBorderStyle",
    ]) {
      expect(shader.uniforms[name]).toBe(uniforms[name]);
    }

    controller.setScreenOverlay("preview", { ...preview, opacity: 0 });
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.9, 50, 0.8,
    ]);
    expect(uniforms.carmaScreenToBorderImage.value.equals(fullImage)).toBe(
      true
    );
    controller.setScreenOverlay("preview", null);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.9, 50, 0.8,
    ]);
    controller.setScreenOverlay("crop", null);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      0, 0, 0, 0,
    ]);
    controller.dispose();
    root.geometry.dispose();
    material.dispose();
  });
  it("copies frame transforms and CSS dimensions and invalidates only when their values change", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const border = {
      viewportToImage: new Matrix3(),
      imageSize: { width: 800, height: 600 },
      width: 2,
      opacity: 0.9,
      feather: 50,
      featherOpacity: 0.8,
    };
    const overlay = {
      texture: new Texture(),
      viewportToTexture: new Matrix3(),
      opacity: 1,
      border,
    };
    controller.setScreenOverlay("preview", overlay);
    const epoch = controller.epoch;
    controller.setScreenOverlay("preview", overlay);
    expect(controller.epoch).toBe(epoch);
    border.viewportToImage.elements[6] = 0.2;
    border.imageSize.width = 400;
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenToBorderImage.value.elements[6]).toBe(0);
    expect(uniforms.carmaScreenBorderImageSize.value.x).toBe(800);
    controller.setScreenOverlay("preview", overlay);
    expect(controller.epoch).toBeGreaterThan(epoch);
    expect(uniforms.carmaScreenToBorderImage.value.elements[6]).toBe(0.2);
    expect(uniforms.carmaScreenBorderImageSize.value.x).toBe(400);
    controller.dispose();
  });
});
