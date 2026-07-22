import { describe, expect, it } from "vitest";

import { resolveTerrainBaseHeight } from "./elevationFrame";

describe("resolveTerrainBaseHeight", () => {
  it("lowers ellipsoidal source heights into DHHN2016", () => {
    expect(
      resolveTerrainBaseHeight({
        datum: "ellipsoidal",
        zBase: 187.25,
        geoidUndulation: 47.4,
      })
    ).toBeCloseTo(139.85, 10);
  });

  it("keeps DHHN2016 source heights unchanged", () => {
    expect(
      resolveTerrainBaseHeight({
        datum: "dhhn",
        zBase: 140.1,
        geoidUndulation: 47.4,
      })
    ).toBe(140.1);
  });

  it("requires a terrain sample for surface-relative data", () => {
    expect(() =>
      resolveTerrainBaseHeight({
        datum: "surfaceRelative",
        zBase: -3,
        geoidUndulation: 47.4,
      })
    ).toThrow("active registered terrain surface");
  });

  it("uses the sampled terrain-provider height for relative data", () => {
    expect(
      resolveTerrainBaseHeight({
        datum: "surfaceRelative",
        zBase: -3,
        geoidUndulation: 47.4,
        surfaceHeightTerrain: 153.2,
      })
    ).toBe(153.2);
  });
});
