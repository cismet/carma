import { describe, expect, it } from "vitest";

import {
  buildCategoryLut,
  buildRampBytes,
  categoryColor,
  QUALITATIVE_RAMP_NAMES,
} from "./colorRamps";

describe("point-cloud color ramps", () => {
  it("reverses continuous ramp endpoints", () => {
    const normal = buildRampBytes("viridis");
    const inverted = buildRampBytes("viridis", true);

    expect([...inverted.slice(0, 3)]).toEqual([...normal.slice(-4, -1)]);
    expect([...inverted.slice(-4, -1)]).toEqual([...normal.slice(0, 3)]);
  });

  it("encodes category color, opacity and visibility in the lookup table", () => {
    const lookup = buildCategoryLut("classification", false, {
      "2": { color: "#123456", opacity: 0.5, visible: true },
      "6": { color: "#abcdef", opacity: 1, visible: false },
    });

    expect([...lookup.slice(2 * 4, 2 * 4 + 4)]).toEqual([
      0x12, 0x34, 0x56, 128,
    ]);
    expect([...lookup.slice(6 * 4, 6 * 4 + 4)]).toEqual([0xab, 0xcd, 0xef, 0]);
  });

  it("offers one city-map classification palette with semantic AWG colors", () => {
    expect(QUALITATIVE_RAMP_NAMES).toEqual(["classification"]);
    expect(categoryColor("classification", 2)).toBe("#858b91");
    expect(categoryColor("classification", 5)).toBe("#087a3e");
    expect(categoryColor("classification", 6)).toBe("#e89b45");
    expect(categoryColor("classification", 11)).toBe("#46515e");
  });
});
