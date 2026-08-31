import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ShadowController, type ShadowUpdate } from "./shadow-controller";

const receiverWorldPoints = [
  new THREE.Vector3(-50, 100, -25),
  new THREE.Vector3(50, 100, -25),
  new THREE.Vector3(50, 140, 25),
  new THREE.Vector3(-50, 140, 25),
];
const SUN_DISC_TEST_RADIUS_RAD = ((0.53 / 2) * Math.PI) / 180 + 1e-12;

const buildUpdate = (overrides: Partial<ShadowUpdate> = {}): ShadowUpdate => ({
  receiverWorldPoints,
  receiverAnchorWorldPosition: new THREE.Vector3(0, 100, 0),
  minimumElevationMeters: 100,
  maximumElevationMeters: 140,
  directionToSun: new THREE.Vector3(0.5, 0.7, -0.5).normalize(),
  color: 0xffffff,
  intensity: 2,
  shadowIntensity: 0.8,
  quality: 4,
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

    controller.applySunDiscSample(1, 32);

    expect(controller.lights[0].position.equals(before)).toBe(false);
    expect(controller.lights[0].shadow.needsUpdate).toBe(true);

    controller.restoreSunDiscCenter();

    expect(controller.lights[0].position.distanceTo(before)).toBeLessThan(1e-9);
  });

  it("uses distinct tangent-plane offsets across the whole sun disc", () => {
    const controller = new ShadowController(new THREE.Scene());
    const update = buildUpdate();
    controller.setSoftSun(true);
    controller.update(update);
    const directionToSun = update.directionToSun.clone().normalize();
    const tangentA = new THREE.Vector3(0, 1, 0)
      .cross(directionToSun)
      .normalize();
    const tangentB = directionToSun.clone().cross(tangentA);
    const offsets = Array.from({ length: 32 }, (_, round) => {
      controller.applySunDiscSample(round, 32);
      const sampledDirection = controller.lights[0].position
        .clone()
        .sub(update.receiverAnchorWorldPosition)
        .normalize();
      return [
        sampledDirection.dot(tangentA).toFixed(12),
        sampledDirection.dot(tangentB).toFixed(12),
      ] as const;
    });

    expect(new Set(offsets.map(([x]) => x)).size).toBe(offsets.length);
    expect(new Set(offsets.map(([, y]) => y)).size).toBe(offsets.length);
  });

  it("rotates the sun direction around the terrain anchor", () => {
    const controller = new ShadowController(new THREE.Scene());
    const anchor = new THREE.Vector3(20, 123, -40);
    controller.setSoftSun(true);
    controller.update(buildUpdate({ receiverAnchorWorldPosition: anchor }));

    controller.applySunDiscSample(3, 32);

    expect(controller.lights[0].target.position.equals(anchor)).toBe(true);
    const sampledDirection = controller.lights[0].position
      .clone()
      .sub(anchor)
      .normalize();
    expect(
      sampledDirection.angleTo(buildUpdate().directionToSun)
    ).toBeLessThanOrEqual(SUN_DISC_TEST_RADIUS_RAD);
  });

  it("keeps every receiver inside the shadow map for every sun-disc sample", () => {
    const controller = new ShadowController(new THREE.Scene());
    controller.setSoftSun(true);
    controller.update(
      buildUpdate({
        directionToSun: new THREE.Vector3(0.8, 0.05, -0.6).normalize(),
      })
    );

    for (let round = 0; round < 8; round += 1) {
      controller.applySunDiscSample(round, 32);
      const camera = controller.lights[0].shadow.camera;
      for (const point of receiverWorldPoints) {
        const clip = point
          .clone()
          .applyMatrix4(camera.matrixWorldInverse)
          .applyMatrix4(camera.projectionMatrix);
        expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
      }
    }
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
