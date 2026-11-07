import { describe, expect, it } from "vitest";

import { resolvePickLiftMeters } from "./maplibre-surface-pick";

describe("resolvePickLiftMeters", () => {
  it("grows with the distance to the camera", () => {
    expect(resolvePickLiftMeters(35)).toBeCloseTo(0.0035, 9);
  });

  it("never goes below half a millimetre or into the centimetres", () => {
    expect(resolvePickLiftMeters(0.5)).toBe(0.0005);
    expect(resolvePickLiftMeters(5_000)).toBe(0.009);
    expect(resolvePickLiftMeters(Number.NaN)).toBe(0.0005);
  });
});
