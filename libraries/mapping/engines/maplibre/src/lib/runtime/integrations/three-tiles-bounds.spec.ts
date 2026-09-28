import { Box3, Frustum, Matrix4, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import {
  intersectsTileFrustumMargin,
  readOrientedTileBounds,
} from "./three-tiles-bounds";

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

const camera = new OrthographicCamera(-1, 1, 1, -1, 1, 10);
const frustum = new Frustum().setFromProjectionMatrix(camera.projectionMatrix);
const identity = new Matrix4();
const box = (x: number, width: number, z = -5) =>
  new Box3(new Vector3(x, 0, z), new Vector3(x + width, width, z + width));

describe("tile-width reserve margin", () => {
  it.each([0.125, 1, 8])("uses one own tile width at scale %s", (width) => {
    expect(
      intersectsTileFrustumMargin(
        box(1 + width * 0.99, width),
        identity,
        frustum,
        1
      )
    ).toBe(true);
    expect(
      intersectsTileFrustumMargin(box(1 + width, width), identity, frustum, 1)
    ).toBe(false);
  });

  it("keeps only the nearby children of a coarse reserve parent", () => {
    const parent = box(1, 2);
    const nearChild = box(1, 1);
    const farChild = box(2, 1);
    expect(intersectsTileFrustumMargin(parent, identity, frustum, 1)).toBe(
      true
    );
    expect(intersectsTileFrustumMargin(nearChild, identity, frustum, 1)).toBe(
      true
    );
    expect(intersectsTileFrustumMargin(farChild, identity, frustum, 1)).toBe(
      false
    );
  });

  it("keeps depth clipping and does not expand behind the camera or far plane", () => {
    expect(
      intersectsTileFrustumMargin(box(0, 0.5, 0), identity, frustum, 1)
    ).toBe(false);
    expect(
      intersectsTileFrustumMargin(box(0, 0.5, -12), identity, frustum, 1)
    ).toBe(false);
  });

  it("uses transformed OBB widths without changing bounds or camera", () => {
    const bounds = box(0, 1);
    const transform = new Matrix4().makeScale(2, 1, 1).setPosition(2.99, 0, 0);
    const snapshot = bounds.clone();
    expect(intersectsTileFrustumMargin(bounds, transform, frustum, 1)).toBe(
      true
    );
    transform.setPosition(3, 0, 0);
    expect(intersectsTileFrustumMargin(bounds, transform, frustum, 1)).toBe(
      false
    );
    expect(bounds).toEqual(snapshot);
    expect(
      intersectsTileFrustumMargin(box(1.01, 1), identity, frustum, 0)
    ).toBe(false);
  });
});
