import { describe, expect, it } from "vitest";

import { buildVolumeBoxLinePositions } from "./volume-boxes";

describe("buildVolumeBoxLinePositions", () => {
  it("builds twelve hairline edges for every volume", () => {
    const positions = buildVolumeBoxLinePositions([
      {
        minimum: [1, 2, 3],
        maximum: [4, 5, 6],
      },
    ]);

    expect(positions).toHaveLength(12 * 2 * 3);
    expect([...positions.slice(0, 6)]).toEqual([1, 2, 3, 4, 2, 3]);
    expect([...positions.slice(-6)]).toEqual([4, 5, 3, 4, 5, 6]);
  });
});
