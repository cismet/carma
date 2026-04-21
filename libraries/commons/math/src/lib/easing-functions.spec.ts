import { describe, expect, it } from "vitest";

import {
  CIRCULAR_IN,
  CIRCULAR_IN_OUT,
  CIRCULAR_OUT,
  Easing,
} from "./easing-functions";

describe("circular easing functions", () => {
  it("matches the canonical boundary values", () => {
    expect(CIRCULAR_IN(0)).toBe(0);
    expect(CIRCULAR_IN(1)).toBe(1);
    expect(CIRCULAR_OUT(0)).toBe(0);
    expect(CIRCULAR_OUT(1)).toBe(1);
    expect(CIRCULAR_IN_OUT(0)).toBe(0);
    expect(CIRCULAR_IN_OUT(1)).toBe(1);
  });

  it("keeps the midpoint centered for the in-out variant", () => {
    expect(CIRCULAR_IN_OUT(0.5)).toBeCloseTo(0.5, 12);
  });

  it("exports circular easing variants through the grouped Easing object", () => {
    expect(Easing.CIRCULAR_IN(0.25)).toBeCloseTo(CIRCULAR_IN(0.25), 12);
    expect(Easing.CIRCULAR_OUT(0.25)).toBeCloseTo(CIRCULAR_OUT(0.25), 12);
    expect(Easing.CIRCULAR_IN_OUT(0.25)).toBeCloseTo(CIRCULAR_IN_OUT(0.25), 12);
  });
});
