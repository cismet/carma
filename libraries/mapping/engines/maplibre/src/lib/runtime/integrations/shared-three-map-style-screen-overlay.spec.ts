import { describe, expect, it } from "vitest";
import { Matrix3, Texture, Vector2 } from "three";
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
});
