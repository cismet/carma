import { Box3, Matrix4, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { readOrientedTileBounds } from "./three-tiles-bounds";

describe("native oriented tile bounds", () => {
  it("retains the public OBB instead of inflating through an intermediate AABB", () => {
    const nativeBox = new Box3(new Vector3(-10, -1, -1), new Vector3(10, 1, 1));
    const nativeTransform = new Matrix4().makeRotationZ(Math.PI / 4);
    const lightTransform = nativeTransform.clone().invert();
    const getAABB = vi.fn((target: Box3) =>
      target.copy(nativeBox).applyMatrix4(nativeTransform)
    );
    const result = new Box3();
    const resultTransform = new Matrix4();
    readOrientedTileBounds(
      {
        getAABB,
        getOBB: (target, transform) => {
          target.copy(nativeBox);
          transform.copy(nativeTransform);
        },
      },
      result,
      resultTransform
    );
    const direct = result
      .clone()
      .applyMatrix4(lightTransform.clone().multiply(resultTransform));
    const inflated = getAABB(new Box3()).applyMatrix4(lightTransform);
    expect(direct.getSize(new Vector3()).y).toBeCloseTo(2);
    expect(inflated.getSize(new Vector3()).y).toBeCloseTo(22);
    // The sole AABB invocation above is the explicit counterfactual, not read.
    expect(getAABB).toHaveBeenCalledTimes(1);
  });

  it("clears a previous OBB transform for legacy AABB-only volumes", () => {
    const source = new Box3(new Vector3(-1, -2, -3), new Vector3(1, 2, 3));
    const result = new Box3();
    const transform = new Matrix4().makeTranslation(20, 30, 40);
    readOrientedTileBounds(
      { getAABB: (target) => target.copy(source) },
      result,
      transform
    );
    expect(result).toEqual(source);
    expect(transform).toEqual(new Matrix4());
  });
});
