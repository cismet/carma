import { describe, expect, it, vi } from "vitest";
import { Box3, Vector3 } from "three";
import { mesh } from "../../core/mesh-tile-test-fixtures";
import type { ShadowReceiverMask } from "../../core/shadow-receiver-mask";
import { createCasterVolumeDemand } from "./three-tiles-runtime-caster-demand";

describe("caster publication demand", () => {
  it("rejects caster volume outside the root before receiver queries", () => {
    const root = mesh(null, 0);
    const tile = mesh(root, 1);
    const rootBounds = new Box3(new Vector3(-2, -2, -2), new Vector3(2, 2, 2));
    const outsideBounds = new Box3(
      new Vector3(3, -1, -1),
      new Vector3(4, 1, 1)
    );
    for (const [entry, bounds] of [
      [root, rootBounds],
      [tile, outsideBounds],
    ] as const)
      Object.assign(entry, {
        engineData: {
          boundingVolume: { getAABB: (out: Box3) => out.copy(bounds) },
        },
      });
    const match = vi.fn(() => true);
    const mask = { sourceCount: 1, match } as unknown as ShadowReceiverMask;
    expect(createCasterVolumeDemand(mask, 6, () => root)(tile)).toMatchObject({
      intersects: false,
      errorPixels: 0,
    });
    expect(match).not.toHaveBeenCalled();
  });
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
    expect(createCasterVolumeDemand(mask, 6)(tile)).toMatchObject({
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
    expect(createCasterVolumeDemand(mask, 1)(tile).errorPixels).toBe(0.02);
    expect(createCasterVolumeDemand(mask, 6)(tile).errorPixels).toBe(0.12);
    match.mockReturnValue(false);
    expect(createCasterVolumeDemand(mask, 6)(tile)).toMatchObject({
      intersects: false,
      errorPixels: 0,
    });
  });
});
