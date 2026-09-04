import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyShadowReceiverMask,
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  receiverMatchedTileError,
  type ShadowReceiverMatch,
  type ShadowReceiverSource,
} from "./three-tiles-shadow-receiver-mask";

const box = (
  minimum: readonly [number, number, number],
  maximum: readonly [number, number, number]
) =>
  new THREE.Box3(new THREE.Vector3(...minimum), new THREE.Vector3(...maximum));

const source = (
  bounds: THREE.Box3,
  options: Partial<Omit<ShadowReceiverSource, "bounds">> = {}
): ShadowReceiverSource => ({
  bounds,
  maximumCasterDistance: options.maximumCasterDistance ?? 50,
  geometricError: options.geometricError ?? 4,
  centerness: options.centerness ?? 0.5,
});

const match = (): ShadowReceiverMatch => ({
  receiverGeometricError: Number.POSITIVE_INFINITY,
  receiverCenterness: 0,
  lightFacing: 0,
});

describe("createShadowReceiverMask", () => {
  it("keeps every partial caster between a receiver and the sunward limit", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([-5, -5, -95], [5, 5, -85]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -75], [5, 5, -65]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -140], [5, 5, -130]), match())).toBe(false);
    expect(mask?.match(box([-5, -5, -45], [5, 5, -35]), match())).toBe(false);
  });

  it("rejects hierarchy branches whose light-space footprint misses all receivers", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([20, 20, -95], [30, 30, -85]), match())).toBe(false);
  });

  it("tests the complete 3d cross-section including the receiver height", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, 20, -110], [10, 40, -100]))],
      new THREE.Matrix4()
    );

    expect(mask?.match(box([-5, 35, -90], [5, 45, -80]), match())).toBe(true);
    expect(mask?.match(box([-5, -5, -90], [5, 5, -80]), match())).toBe(false);
  });

  it("uses the finest intersected receiver error and strongest view priority", () => {
    const mask = createShadowReceiverMask(
      [
        source(box([-20, -10, -110], [5, 10, -100]), {
          geometricError: 8,
          centerness: 0.9,
        }),
        source(box([-5, -10, -110], [20, 10, -100]), {
          geometricError: 2,
          centerness: 0.3,
        }),
      ],
      new THREE.Matrix4()
    );
    const result = match();

    expect(mask?.match(box([-2, -5, -95], [2, 5, -85]), result)).toBe(true);
    expect(result.receiverGeometricError).toBe(2);
    expect(result.receiverCenterness).toBe(0.9);
  });

  it("applies the tiles-to-light transform before indexing", () => {
    const receiver = source(box([-10, -10, -110], [10, 10, -100]));
    const caster = box([-30, -5, -108], [-20, 5, -104]);
    const identityMask = createShadowReceiverMask(
      [receiver],
      new THREE.Matrix4()
    );
    const rotatedMask = createShadowReceiverMask(
      [receiver],
      new THREE.Matrix4().makeRotationY(Math.PI / 2)
    );

    expect(identityMask?.match(caster, match())).toBe(false);
    expect(rotatedMask?.match(caster, match())).toBe(true);
    expect(rotatedMask?.sourceCount).toBe(1);
  });

  it("selects casters only along the receiver-to-sun direction", () => {
    const lightCamera = new THREE.OrthographicCamera(-50, 50, 50, -50, 1, 500);
    lightCamera.position.set(80, 60, -40);
    lightCamera.lookAt(0, 0, 0);
    lightCamera.updateMatrixWorld(true);
    const towardSun = lightCamera.position.clone().normalize();
    const receiver = box([-5, -5, -5], [5, 5, 5]);
    const boxAt = (center: THREE.Vector3) =>
      new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(6, 6, 6));
    const mask = createShadowReceiverMask(
      [source(receiver, { maximumCasterDistance: 70 })],
      lightCamera.matrixWorldInverse
    );

    expect(
      mask?.match(boxAt(towardSun.clone().multiplyScalar(40)), match())
    ).toBe(true);
    expect(
      mask?.match(boxAt(towardSun.clone().multiplyScalar(-40)), match())
    ).toBe(false);
  });

  it("keeps BVH queries conservative across many receiver leaves", () => {
    const receivers = Array.from({ length: 24 }, (_, index) =>
      source(box([index * 20, 0, -100], [index * 20 + 10, 10, -90]), {
        geometricError: index + 1,
      })
    );
    const mask = createShadowReceiverMask(receivers, new THREE.Matrix4());
    const result = match();

    expect(mask?.match(box([401, 1, -80], [409, 9, -70]), result)).toBe(true);
    expect(result.receiverGeometricError).toBe(21);
  });
});

describe("receiverMatchedTileError", () => {
  it("stops at the receiver geometric error and refines coarser casters", () => {
    expect(receiverMatchedTileError(4, 4, 1)).toBe(1);
    expect(receiverMatchedTileError(8, 4, 1)).toBe(2);
    expect(receiverMatchedTileError(2, 4, 1)).toBe(0.5);
  });

  it("requires a leaf when the receiver has zero geometric error", () => {
    expect(receiverMatchedTileError(1, 0, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(receiverMatchedTileError(0, 0, 1)).toBe(0);
  });
});

describe("applyShadowReceiverMask", () => {
  it("rescues a sunward hierarchy branch rejected by the camera frustum", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );
    const target = { inView: false, error: 0 };
    const result = match();

    expect(
      applyShadowReceiverMask(
        mask!,
        box([-5, -5, -80], [5, 5, -70]),
        target,
        result,
        8,
        1
      )
    ).toBe(true);
    expect(target).toEqual({ inView: true, error: 2 });
  });

  it("removes a shadow-camera tile outside every receiver extrusion", () => {
    const mask = createShadowReceiverMask(
      [source(box([-10, -10, -110], [10, 10, -100]))],
      new THREE.Matrix4()
    );
    const target = { inView: true, error: 10 };

    expect(
      applyShadowReceiverMask(
        mask!,
        box([20, 20, -80], [30, 30, -70]),
        target,
        match(),
        8,
        1
      )
    ).toBe(false);
    expect(target).toEqual({ inView: false, error: 10 });
  });
});

describe("maximumSweepDistanceWithinBox", () => {
  it("stops a receiver sweep at the first tileset-bound exit", () => {
    const receiver = box([40, 0, 40], [50, 10, 50]);
    const tileset = box([0, -20, 0], [100, 80, 100]);
    const direction = new THREE.Vector3(1, 1, 0).normalize();

    expect(
      maximumSweepDistanceWithinBox(receiver, tileset, direction)
    ).toBeCloseTo(60 * Math.SQRT2);
  });
});
