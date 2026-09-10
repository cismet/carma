import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { shadowReceiverCorners } from "./shadow-page-plan";
import {
  fitShadowReceiverCapture,
  budgetShadowReceiverCaptures,
  shadowReceiverCaptureOrientation,
} from "./shadow-receiver-capture";

const bounds = new THREE.Box3(
  new THREE.Vector3(-40, 7, -30),
  new THREE.Vector3(40, 67, 30)
);
const options = {
  groundTexelTargetMeters: 0.5,
  maximumDimension: 4096,
  maximumPixels: 4096 ** 2,
};

describe("complete source receiver capture", () => {
  it("fits nine 2048-square captures into one aggregate retained budget", () => {
    const plan = fitShadowReceiverCapture(bounds, new THREE.Quaternion(), {
      ...options,
      groundTexelTargetMeters: 0.001,
      maximumDimension: 2048,
    });
    const entries = Array.from({ length: 9 }, (_, i) => ({
      id: String(i),
      plan,
      screenArea: 0.25,
    }));
    const allocated = budgetShadowReceiverCaptures(entries, 256 * 1024 ** 2);
    expect(allocated.size).toBe(9);
    expect(
      [...allocated.values()].reduce(
        (sum, p) => sum + p.width * p.height * 8,
        0
      )
    ).toBe(256 * 1024 ** 2);
    expect(
      [...allocated.values()].filter(
        (p) => p.width !== plan.width || p.height !== plan.height
      )
    ).toHaveLength(2);
    for (const p of allocated.values()) {
      expect(Number.isInteger(Math.log2(p.width))).toBe(true);
      expect(Number.isInteger(Math.log2(p.height))).toBe(true);
      expect(p.camera).toBe(plan.camera);
      if (p.width !== plan.width) expect(p.limited).toBe(true);
    }
    expect(plan.width).toBe(2048);
  });

  it("weights screen coverage and keeps allocation stable for order and sub-class movement", () => {
    const plan = fitShadowReceiverCapture(bounds, new THREE.Quaternion(), {
      ...options,
      groundTexelTargetMeters: 0.001,
      maximumDimension: 2048,
    });
    const entries = [
      { id: "foreground", plan, screenArea: 0.8 },
      { id: "edge", plan, screenArea: 0.03 },
    ];
    const bytes = 2048 ** 2 * 8 + 1024 ** 2 * 8;
    const allocated = budgetShadowReceiverCaptures(entries, bytes);
    expect(allocated.get("foreground")).toBe(plan);
    expect(allocated.get("edge")!.width * allocated.get("edge")!.height).toBe(
      1024 ** 2
    );
    const moved = budgetShadowReceiverCaptures(
      [...entries].reverse().map((entry) => ({
        ...entry,
        screenArea: entry.screenArea * 1.01,
      })),
      bytes
    );
    expect([...moved].map(([id, p]) => [id, p.key])).toEqual(
      [...allocated].map(([id, p]) => [id, p.key])
    );
    expect(
      budgetShadowReceiverCaptures(entries, 2 * 2048 ** 2 * 8).get("edge")
    ).toBe(plan);
  });
  it("contains every corner of the full tile, including walls outside the observer crop", () => {
    const orientation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-0.6, 0.3, 0)
    );
    const { camera } = fitShadowReceiverCapture(bounds, orientation, options);
    const matrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    for (const point of shadowReceiverCorners(bounds)) {
      const clip = point.applyMatrix4(matrix);
      expect(Math.abs(clip.x)).toBeLessThan(1);
      expect(Math.abs(clip.y)).toBeLessThan(1);
      expect(Math.abs(clip.z)).toBeLessThan(1);
    }
  });

  it("ignores observer translation but changes identity when receiver-facing direction changes", () => {
    const observer = new THREE.PerspectiveCamera(60, 1.5, 1, 1000);
    observer.rotation.set(-0.6, 0.3, 0);
    observer.updateMatrixWorld(true);
    const before = fitShadowReceiverCapture(
      bounds,
      shadowReceiverCaptureOrientation(observer),
      options
    );
    observer.position.set(500, 100, -700);
    observer.updateMatrixWorld(true);
    const translated = fitShadowReceiverCapture(
      bounds,
      shadowReceiverCaptureOrientation(observer),
      options
    );
    expect(translated.key).toBe(before.key);
    observer.rotation.y += 0.2;
    observer.updateMatrixWorld(true);
    expect(
      fitShadowReceiverCapture(
        bounds,
        shadowReceiverCaptureOrientation(observer),
        options
      ).key
    ).not.toBe(before.key);
  });

  it("changes allocation only when demand crosses a real power-of-two class", () => {
    const orientation = new THREE.Quaternion();
    const before = fitShadowReceiverCapture(bounds, orientation, options);
    const nearby = fitShadowReceiverCapture(bounds, orientation, {
      ...options,
      groundTexelTargetMeters: 0.49,
    });
    expect(nearby.key).toBe(before.key);
    const fine = fitShadowReceiverCapture(bounds, orientation, {
      ...options,
      groundTexelTargetMeters: 0.1,
    });
    expect(fine.width).toBeGreaterThan(before.width);
    expect(fine.key).not.toBe(before.key);
  });

  it("reports capped precision while bounding both hardware dimensions and working pixels", () => {
    const limited = fitShadowReceiverCapture(bounds, new THREE.Quaternion(), {
      groundTexelTargetMeters: 0.001,
      maximumDimension: 1000,
      maximumPixels: 128 ** 2,
    });
    expect(limited.limited).toBe(true);
    expect(limited.width).toBeLessThanOrEqual(1000);
    expect(limited.height).toBeLessThanOrEqual(1000);
    expect(limited.width * limited.height).toBeLessThanOrEqual(128 ** 2);
    expect(Number.isInteger(Math.log2(limited.width))).toBe(true);
    expect(Number.isInteger(Math.log2(limited.height))).toBe(true);
    expect(() =>
      fitShadowReceiverCapture(bounds, new THREE.Quaternion(), {
        ...options,
        maximumPixels: 0,
      })
    ).toThrow(RangeError);
  });
});
