import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createSunShadowReference,
  type SunShadowReferenceOptions,
} from "./sun-shadow-reference";

const options: SunShadowReferenceOptions = {
  distanceMeters: 15,
  elevationDegrees: 45,
  object: "plate",
  view: "overview",
  pointSun: false,
  shadowMapSize: 1024,
  exposure: 1,
  sunIntensity: 3,
  visibilityOnly: false,
  groundTexelFit: true,
};

describe("standalone sun-shadow reference", () => {
  it("changes the caster gap in situ without replacing the production controller or meshes", () => {
    const reference = createSunShadowReference();
    reference.update(options, 2);
    const meshes = reference.scene.children.filter(
      (object) => object instanceof THREE.Mesh
    );
    const plate = meshes.find(
      (object) => object.geometry instanceof THREE.BoxGeometry
    )!;
    const controller = reference.controller;
    expect(plate.position.y - 0.125).toBe(15);
    reference.update({ ...options, distanceMeters: 4 }, 2);
    expect(plate.position.y - 0.125).toBe(4);
    expect(reference.controller).toBe(controller);
    expect(reference.scene.children).toContain(plate);
    expect(plate.castShadow).toBe(true);
    reference.dispose();
  });

  it("samples the real sun controller without moving the camera", () => {
    const reference = createSunShadowReference();
    reference.update(options, 2);
    const projection = reference.camera.projectionMatrix.clone();
    const first = reference.controller.lights[0].position.clone();
    reference.sample(20, 64);
    expect(reference.controller.lights[0].position.equals(first)).toBe(false);
    expect(reference.camera.projectionMatrix.equals(projection)).toBe(true);
    reference.update({ ...options, pointSun: true }, 2);
    const pointPosition = reference.controller.lights[0].position.clone();
    reference.sample(20, 64);
    expect(reference.controller.lights[0].position.equals(pointPosition)).toBe(
      true
    );
    reference.dispose();
  });

  it("allocates a real rectangular depth buffer at a fixed 4096-square budget on larger hardware", () => {
    const reference = createSunShadowReference(16_384);
    const configured = {
      ...options,
      distanceMeters: 25,
      shadowMapSize: 4_096,
      groundTexelFit: true,
    };
    reference.update(configured, 2);
    const snapshot = reference.snapshot!;

    expect(snapshot.mapTexelBudget).toBe(4_096 ** 2);
    expect(snapshot.totalShadowTexels).toBeLessThanOrEqual(4_096 ** 2);
    expect(snapshot.camera.shadowMapWidth).not.toBe(
      snapshot.camera.shadowMapHeight
    );
    expect(
      Math.max(snapshot.camera.shadowMapWidth, snapshot.camera.shadowMapHeight)
    ).toBeGreaterThan(4_096);
    expect(
      Math.max(snapshot.camera.shadowMapWidth, snapshot.camera.shadowMapHeight)
    ).toBeLessThanOrEqual(16_384);

    reference.update({ ...configured, groundTexelFit: false }, 2);
    expect(reference.snapshot!.camera.shadowMapWidth).toBe(4_096);
    expect(reference.snapshot!.camera.shadowMapHeight).toBe(4_096);
    expect(reference.snapshot!.mapTexelBudget).toBe(snapshot.mapTexelBudget);
    reference.dispose();
  });

  it("changes the requested budget without mistaking it for a hardware limit", () => {
    const reference = createSunShadowReference(8_192);
    for (const shadowMapSize of [512, 1_024, 2_048]) {
      reference.update({ ...options, distanceMeters: 25, shadowMapSize }, 2);
      const snapshot = reference.snapshot!;
      expect(snapshot.mapTexelBudget).toBe(shadowMapSize ** 2);
      expect(snapshot.totalShadowTexels).toBeLessThanOrEqual(
        shadowMapSize ** 2
      );
      expect(
        Math.max(
          snapshot.camera.shadowMapWidth,
          snapshot.camera.shadowMapHeight
        )
      ).toBeGreaterThan(shadowMapSize);
    }
    reference.dispose();
  });

  it("still honors the real hardware limit when the requested budget is larger", () => {
    const reference = createSunShadowReference(1_024);
    reference.update({ ...options, shadowMapSize: 4_096 }, 2);
    expect(reference.snapshot!.mapTexelBudget).toBe(1_024 ** 2);
    expect(reference.snapshot!.camera.shadowMapWidth).toBeLessThanOrEqual(
      1_024
    );
    expect(reference.snapshot!.camera.shadowMapHeight).toBeLessThanOrEqual(
      1_024
    );
    reference.dispose();
  });

  it("keeps thin occluders available as an adaptive-sampling regression fixture", () => {
    const reference = createSunShadowReference();
    reference.update({ ...options, object: "thin-fence" }, 2);
    const fence = reference.scene.children.find(
      (object) => object instanceof THREE.Group
    )!;
    expect(fence.visible).toBe(true);
    expect(fence.children).toHaveLength(9);
    expect(fence.children.every((object) => object.castShadow)).toBe(true);
    reference.dispose();
    expect(reference.scene.children).toHaveLength(0);
  });
});
