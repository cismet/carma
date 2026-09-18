import { it, expect } from "vitest";
import {
  GCG2016_SOFTWARE_BOUND_METERS,
  getGcg2016HeightAnomalies,
} from "./gcg2016";
import type { LngLatArray } from "@carma-geo/data-structures";

// Two samples each carry the encoding bound, so their difference may miss the
// float source by twice that bound.
const tolerance = 2 * GCG2016_SOFTWARE_BOUND_METERS;

it("samples Wuppertal and the existing distant tower sites", async () => {
  const sites = [
    [7.20158, 51.25656],
    [7.7566997, 51.1480857],
    [7.13413305, 51.3562576],
  ];
  const grid = Array.from({ length: 121 }, (_, i) => [
    7.0 + (i % 11) * 0.03,
    51.16 + Math.floor(i / 11) * 0.016,
  ]);
  const values = await getGcg2016HeightAnomalies([
    ...sites,
    ...grid,
  ] as LngLatArray.deg[]);
  expect(values.every(Number.isFinite)).toBe(true);
  expect(Math.abs(values[1] - values[0] - 1.055308879)).toBeLessThanOrEqual(
    tolerance
  );
  expect(Math.abs(values[2] - values[0] + 0.466579915)).toBeLessThanOrEqual(
    tolerance
  );
  expect(
    Math.abs(Math.min(...values.slice(3)) - 46.0783842)
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(Math.max(...values.slice(3)) - 47.0220049)
  ).toBeLessThanOrEqual(tolerance);
});
