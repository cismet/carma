import { describe, expect, it } from "vitest";
import { scaleOpacity } from "./scaleOpacity";

describe("scaleOpacity", () => {
  it("multiplies numbers and keeps 0", () => {
    expect(scaleOpacity(0.6, 0.5)).toBe(0.3);
    expect(scaleOpacity(0, 0.5)).toBe(0);
  });

  it("returns the value untouched at full opacity", () => {
    const band = ["step", ["zoom"], 0, 20, 1, 21, 0];
    expect(scaleOpacity(band, 1)).toBe(band);
  });

  it("scales the outputs of a zoom step, not its stops", () => {
    expect(scaleOpacity(["step", ["zoom"], 0, 20, 1, 21, 0], 0.5)).toEqual([
      "step", ["zoom"], 0, 20, 0.5, 21, 0,
    ]);
  });

  it("scales the outputs of an interpolate, nested ones included", () => {
    expect(
      scaleOpacity(
        ["interpolate", ["linear"], ["zoom"], 19, 0.2, 21, ["match", ["get", "c"], "a", 1, 0.4]],
        0.5
      )
    ).toEqual([
      "interpolate", ["linear"], ["zoom"], 19, 0.1, 21, ["*", ["match", ["get", "c"], "a", 1, 0.4], 0.5],
    ]);
  });

  it("wraps other expressions", () => {
    expect(scaleOpacity(["match", ["get", "c"], "a", 1, 0.4], 0.5)).toEqual([
      "*", ["match", ["get", "c"], "a", 1, 0.4], 0.5,
    ]);
  });
});
