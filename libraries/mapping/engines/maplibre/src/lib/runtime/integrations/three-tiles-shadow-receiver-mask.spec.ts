import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
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
