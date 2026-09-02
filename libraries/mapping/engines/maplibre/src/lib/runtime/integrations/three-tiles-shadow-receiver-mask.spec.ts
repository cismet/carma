import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createShadowReceiverMask } from "./three-tiles-shadow-receiver-mask";

const box = (
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number]
) =>
  new THREE.Box3(new THREE.Vector3(...minimum), new THREE.Vector3(...maximum));

describe("createShadowReceiverMask", () => {
  it("keeps casters before a receiver and rejects tiles behind it", () => {
    const mask = createShadowReceiverMask(
      [box([-10, -10, -110], [10, 10, -100])],
      new THREE.Matrix4()
    );

    expect(mask?.accepts(box([-5, -5, -80], [5, 5, -70]))).toBe(true);
    expect(mask?.accepts(box([-5, -5, -108], [5, 5, -104]))).toBe(true);
    expect(mask?.accepts(box([-5, -5, -140], [5, 5, -130]))).toBe(false);
  });

  it("rejects shadow-only tiles whose light-space footprint misses the view", () => {
    const mask = createShadowReceiverMask(
      [box([-10, -10, -110], [10, 10, -100])],
      new THREE.Matrix4()
    );

    expect(mask?.accepts(box([20, 20, -80], [30, 30, -70]))).toBe(false);
  });

  it("uses the first camera-source volume in each projected grid cell", () => {
    const mask = createShadowReceiverMask(
      [
        box([-20, -10, -210], [-1, 10, -200]),
        box([1, -10, -110], [20, 10, -100]),
      ],
      new THREE.Matrix4()
    );

    expect(mask?.accepts(box([-15, -5, -160], [-5, 5, -150]))).toBe(true);
    expect(mask?.accepts(box([5, -5, -160], [15, 5, -150]))).toBe(false);
  });

  it("applies the tiles-to-light transform before masking", () => {
    const source = box([-10, -10, -110], [10, 10, -100]);
    const caster = box([-30, -5, -108], [-20, 5, -104]);
    const identityMask = createShadowReceiverMask(
      [source],
      new THREE.Matrix4()
    );
    const transform = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const mask = createShadowReceiverMask([source], transform);

    expect(identityMask?.accepts(caster)).toBe(false);
    expect(mask?.accepts(caster)).toBe(true);
    expect(mask?.sourceCount).toBe(1);
  });
});
