import { describe, expect, it, vi } from "vitest";
import { Box3, Vector3 } from "three";
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
