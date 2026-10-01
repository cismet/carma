import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { RuntimeTile } from "./three-tiles-runtime-types";
import { createRootTileDomainClip } from "./three-tiles-root-domain";

const box = (minimum: number, maximum: number) =>
  new Box3(new Vector3(minimum, -1, -1), new Vector3(maximum, 1, 1));
const root = (bounds: Box3, transform: Matrix4) =>
  ({
    engineData: {
      boundingVolume: {
        getAABB: (target: Box3) => target.copy(bounds).applyMatrix4(transform),
        getOBB: (target: Box3, matrix: Matrix4) => {
          target.copy(bounds);
          matrix.copy(transform);
        },
      },
    },
  } as unknown as RuntimeTile);

describe("3D root-domain spatial clipping", () => {
  it("clips partial overlap in transformed root axes and rejects outside candidates", () => {
    const transform = new Matrix4()
      .makeRotationZ(Math.PI / 3)
      .setPosition(100, 20, -5);
    const clip = createRootTileDomainClip(() => root(box(-2, 2), transform));
    const candidate = box(1, 4);
    const candidateTransform = transform.clone();
    expect(clip(candidate, candidateTransform)).toBe(true);
    expect(candidate.min.x).toBeCloseTo(1);
    expect(candidate.max.x).toBeCloseTo(2);
    expect(candidateTransform.equals(transform)).toBe(true);
    expect(clip(box(3, 4), transform.clone())).toBe(false);
  });
  it("preserves contained candidate axes and incomplete-metadata fallbacks", () => {
    const transform = new Matrix4().makeTranslation(10, 0, 0);
    const clip = createRootTileDomainClip(() =>
      root(new Box3(new Vector3(-5, -5, -5), new Vector3(5, 5, 5)), transform)
    );
    const candidate = box(-1, 1);
    const ownTransform = transform
      .clone()
      .multiply(new Matrix4().makeRotationZ(0.2));
    const before = ownTransform.clone();
    expect(clip(candidate, ownTransform)).toBe(true);
    expect(candidate.equals(box(-1, 1))).toBe(true);
    expect(ownTransform.equals(before)).toBe(true);
    const unavailable = {
      engineData: {
        boundingVolume: {
          getAABB: () => {
            throw new Error("not ready");
          },
        },
      },
    } as unknown as RuntimeTile;
    expect(
      createRootTileDomainClip(() => unavailable)(candidate, ownTransform)
    ).toBe(true);
    expect(
      createRootTileDomainClip(() => undefined)(candidate, ownTransform)
    ).toBe(true);
    const singular = new Matrix4().makeScale(0, 1, 1);
    expect(
      createRootTileDomainClip(() => root(box(-5, 5), singular))(
        candidate,
        ownTransform
      )
    ).toBe(true);
    expect(ownTransform.equals(before)).toBe(true);
  });
});
