import { describe, expect, it } from "vitest";

import {
  buildVolumeBoxLineColors,
  buildVolumeBoxLinePositions,
} from "./volume-boxes";

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

  it("keeps per-volume colors while applying a fallback", () => {
    const colors = buildVolumeBoxLineColors(
      [
        {
          minimum: [0, 0, 0],
          maximum: [1, 1, 1],
          color: "#ff0000",
        },
        { minimum: [1, 1, 1], maximum: [2, 2, 2] },
      ],
      "#0000ff"
    );
    const colorValuesPerBox = 12 * 2 * 3;

    expect([...colors.slice(0, 3)]).toEqual([1, 0, 0]);
    expect([...colors.slice(colorValuesPerBox, colorValuesPerBox + 3)]).toEqual(
      [0, 0, 1]
    );
  });
});
