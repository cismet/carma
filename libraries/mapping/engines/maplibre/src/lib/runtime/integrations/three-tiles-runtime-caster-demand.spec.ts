import { describe, expect, it, vi } from "vitest";
import { Box3, Matrix4, OrthographicCamera, Vector3 } from "three";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";

describe("caster publication demand", () => {
  it("uses receiver-relative error after corridor pruning", () => {
    const tile = mesh(null, 2);
    tile.geometricError = 2;
    const bounds = new Box3(new Vector3(-1, -1, -11), new Vector3(1, 1, -9));
    Object.assign(tile, {
      engineData: {
        boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
      },
    });
    const match = vi.fn((_box, receiver) => {
      receiver.receiverGeometricError = 1;
      receiver.receiverContentLevel = 3;
      return true;
    });
    const mask = { sourceCount: 1, match } as unknown as ShadowReceiverMask;
    const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 100);
    const view = { camera, shadowMapSize: { width: 200, height: 100 } };
    expect(createCasterVolumeDemand(mask, 6, view)(tile)).toMatchObject({
      intersects: true,
      errorPixels: 12,
      receiverGeometricError: 1,
      receiverContentLevel: 3,
    });
    // Receiver error sets demand; shadow-map resolution must not add a second target.
    match.mockImplementation((_box, receiver) => {
      receiver.receiverGeometricError = 100;
      return true;
    });
    expect(createCasterVolumeDemand(mask, 1, view)(tile).errorPixels).toBe(
      0.02
    );
    expect(
      createCasterVolumeDemand(mask, 6, {
        ...view,
        shadowMapSize: { width: 400, height: 200 },
      })(tile).errorPixels
    ).toBe(0.12);
    match.mockReturnValue(false);
    expect(createCasterVolumeDemand(mask, 6, view)(tile)).toMatchObject({
      intersects: false,
      errorPixels: 0,
    });
  });

  it("does not clip upstream casters to the fitted light-camera frustum", () => {
    const tile = mesh(null, 2);
    tile.geometricError = 2;
    const bounds = new Box3(new Vector3(-1, -1, -11), new Vector3(1, 1, -9));
    Object.assign(tile, {
      engineData: {
        boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
      },
    });
    const match = vi.fn((_box, receiver) => {
      receiver.receiverGeometricError = 2;
      return true;
    });
    const mask = { match } as unknown as ShadowReceiverMask;
    const camera = new OrthographicCamera(-10, 10, 10, -10, 1, 100);
    camera.position.x = 50;
    const view = { camera, shadowMapSize: { width: 200, height: 200 } };
    expect(createCasterVolumeDemand(mask, 6, view)(tile).intersects).toBe(true);
    const placement = new Matrix4().makeScale(2, 2, 2).setPosition(50, 0, 0);
    expect(
      createCasterVolumeDemand(mask, 6, view, placement)(tile)
    ).toMatchObject({
      intersects: true,
      errorPixels: 6,
      receiverGeometricError: 2,
    });
    expect(match).toHaveBeenCalledTimes(2);
  });
});
