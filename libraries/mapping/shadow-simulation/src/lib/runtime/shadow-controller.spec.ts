import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ShadowController, type ShadowUpdate } from "./shadow-controller";

const receiverWorldPoints = [
  new THREE.Vector3(-50, 100, -25),
  new THREE.Vector3(50, 100, -25),
  new THREE.Vector3(50, 140, 25),
  new THREE.Vector3(-50, 140, 25),
];

const buildUpdate = (overrides: Partial<ShadowUpdate> = {}): ShadowUpdate => ({
  receiverWorldPoints,
  minimumElevationMeters: 100,
  maximumElevationMeters: 140,
  directionToSun: new THREE.Vector3(0.5, 0.7, -0.5).normalize(),
  color: 0xffffff,
  intensity: 2,
  shadowIntensity: 0.8,
  quality: 4,
  interactive: false,
  ...overrides,
});

describe("ShadowController", () => {
  it("fits one orthographic buffer to the receiver area", () => {
    const scene = new THREE.Scene();
    const controller = new ShadowController(scene);

    const snapshot = controller.update(buildUpdate());

    expect(snapshot?.sampleCount).toBe(1);
    expect(snapshot?.camera.shadowMapWidth).toBe(4_096);
    expect(snapshot?.camera.shadowMapHeight).toBe(4_096);
    expect(snapshot?.camera.rightMeters).toBeGreaterThan(
      snapshot?.camera.leftMeters ?? Infinity
    );
    expect(snapshot?.camera.topMeters).toBeGreaterThan(
      snapshot?.camera.bottomMeters ?? Infinity
    );
    expect(snapshot?.camera.farMeters).toBeGreaterThan(
      snapshot?.camera.nearMeters ?? Infinity
    );
    expect(controller.lights[0].visible).toBe(true);
    expect(controller.lights).toHaveLength(1);
  });

  it("uses one full-resolution buffer for sun-disc sampling", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);

    const snapshot = controller.update(buildUpdate());

    expect(snapshot?.sampleCount).toBe(1);
    expect(snapshot?.camera.shadowMapWidth).toBe(4_096);
    expect(controller.lights).toHaveLength(1);
  });

  it("moves the one light across the sun disc for accumulation rounds", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(buildUpdate());
    const before = controller.lights[0].position.clone();

    controller.applySunDiscSample(1);

    expect(controller.lights[0].position.equals(before)).toBe(false);
    expect(controller.lights[0].shadow.needsUpdate).toBe(true);
  });

  it.each([16, 64] as const)(
    "uses the renderer texture limit at quality %i",
    (quality) => {
      const controller = new ShadowController(new THREE.Scene());
      controller.setMaxShadowMapSize(32_768);

      const snapshot = controller.update(buildUpdate({ quality }));

      expect(snapshot?.camera.shadowMapWidth).toBe(32_768);
    }
  );

  it("uses a reduced shadow buffer while the map is moving", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setMaxShadowMapSize(32_768);

    const snapshot = controller.update(
      buildUpdate({ quality: 64, interactive: true })
    );

    expect(snapshot?.camera.shadowMapWidth).toBe(2_048);
    expect(snapshot?.camera.shadowMapHeight).toBe(2_048);
  });

  it("disables lights without receivers and removes them on disposal", () => {
    const scene = new THREE.Scene();
    const controller = new ShadowController(scene);
    controller.update(buildUpdate());

    expect(
      controller.update(buildUpdate({ receiverWorldPoints: [] }))
    ).toBeNull();
    expect(controller.lights.every(({ visible }) => !visible)).toBe(true);

    controller.dispose();
    expect(
      scene.children.some(({ name }) =>
        name.startsWith("shadow-simulation-sun")
      )
    ).toBe(false);
  });
});
