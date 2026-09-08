import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { fitShadowMap } from "./fit-shadow-map";
import {
  planShadowReceiverPages,
  shadowReceiverCorridor,
  shadowReceiverPixelsPerMeter,
} from "./shadow-page-plan";

const box = (x: number, z: number) =>
  new THREE.Box3(
    new THREE.Vector3(x, 0, z),
    new THREE.Vector3(x + 10, 5, z + 10)
  );

describe("world-fixed shadow receiver demand", () => {
  it("includes every visible receiver, with stable IDs across camera motion", () => {
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
    camera.position.set(5, 30, 80);
    camera.lookAt(5, 0, 0);
    camera.updateMatrixWorld(true);
    const cells = [
      { id: "near", bounds: box(0, 0) },
      { id: "far", bounds: box(0, -50) },
    ];
    const first = planShadowReceiverPages(
      cells,
      camera,
      new THREE.Vector2(1440, 1440),
      0.5
    );
    expect(first.map((p) => p.id)).toEqual(["near", "far"]);
    expect(first[1].groundTexelTargetMeters).toBeGreaterThan(
      first[0].groundTexelTargetMeters
    );
    camera.position.x += 1;
    camera.updateMatrixWorld(true);
    expect(
      planShadowReceiverPages(
        cells,
        camera,
        new THREE.Vector2(1440, 1440),
        0.5
      ).map((p) => p.id)
    ).toEqual(["near", "far"]);
  });

  it("bounds the actual projected displacement, including elevated corners", () => {
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
    camera.position.set(0, 40, 60);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const bounds = box(-5, -5);
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const viewport = new THREE.Vector2(2560, 1440);
    const bound = shadowReceiverPixelsPerMeter(bounds, matrix, viewport);
    for (let i = 0; i < 30; i += 1) {
      const point = new THREE.Vector3(-4 + (i % 8), i % 4, -4 + (i % 7));
      for (const direction of [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ]) {
        const a = point.clone().applyMatrix4(matrix);
        const b = point
          .clone()
          .addScaledVector(direction, 1e-4)
          .applyMatrix4(matrix);
        const displacement =
          Math.hypot(
            ((a.x - b.x) * viewport.x) / 2,
            ((a.y - b.y) * viewport.y) / 2
          ) / 1e-4;
        expect(displacement).toBeLessThanOrEqual(bound);
      }
    }
  });

  it("allocates rectangular nested classes from ground demand and reports hardware caps", () => {
    const options = {
      mapSize: 2048,
      maxMapSize: 8192,
      elevationSine: 0.25,
      sunDiscGuardMeters: 0,
      groundTexelFit: true,
      groundTexelTargetMeters: 0.05,
    };
    const bounds = { left: -20, right: 20, bottom: -20, top: 20 };
    const fine = fitShadowMap(bounds, options);
    expect(fine.mapWidth).toBe(1024);
    expect(fine.mapHeight).toBe(4096);
    expect(fine.groundTexelWidthMeters).toBeLessThanOrEqual(0.05);
    expect(fine.groundTexelHeightMeters).toBeLessThanOrEqual(0.05);
    const far = fitShadowMap(bounds, {
      ...options,
      groundTexelTargetMeters: 0.1,
    });
    expect(far.mapWidth * far.mapHeight).toBe(
      (fine.mapWidth * fine.mapHeight) / 4
    );
    const limited = fitShadowMap(bounds, { ...options, maxMapSize: 512 });
    expect(limited.groundTexelFitLimited).toBe(true);
    expect(limited.groundTexelHeightMeters).toBeGreaterThan(0.05);
  });

  it("widens the dependency envelope for off-centre sun-disc directions", () => {
    const bounds = box(0, 0);
    const corridor = shadowReceiverCorridor(
      bounds,
      new THREE.Vector3(0, 1, 0),
      1000,
      0.005,
      1
    );
    expect(corridor.containsPoint(new THREE.Vector3(14, 1000, 5))).toBe(true);
    expect(corridor.containsPoint(new THREE.Vector3(40, 1000, 5))).toBe(false);
    expect(bounds.max.y).toBe(5);
  });
});
