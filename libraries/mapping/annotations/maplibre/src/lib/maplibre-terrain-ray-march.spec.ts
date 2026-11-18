import { describe, expect, it } from "vitest";
import { PI } from "@carma-units";

import {
  marchTerrainRay,
  resolveTerrainNormalEnu,
} from "./maplibre-terrain-ray-march";

/** A ray from `height` metres descending at `angle` (radians below the horizon) over a field. */
const rayOver =
  (
    height: number,
    depression: number,
    field: (x: number) => number | undefined
  ) =>
  (distance: number) => {
    const x = distance * Math.cos(depression);
    const ground = field(x);
    return ground === undefined
      ? undefined
      : height - distance * Math.sin(depression) - ground;
  };

describe("marchTerrainRay", () => {
  it("meets flat ground where the ray comes down to it", () => {
    const hit = marchTerrainRay(
      rayOver(300, PI / 6, () => 0),
      10_000
    );
    expect(hit).not.toBeNull();
    expect(hit!).toBeCloseTo(600, 2);
  });

  it("stops at the first wall in front of the ground behind it", () => {
    // a 20 m building 5 m wide at x = 400..405, the ray would reach the ground at x ~ 448
    const building = (x: number) => (x >= 400 && x <= 405 ? 20 : 0);
    const depression = PI / 12;
    const hit = marchTerrainRay(rayOver(120, depression, building), 10_000);
    expect(hit).not.toBeNull();
    expect(hit! * Math.cos(depression)).toBeCloseTo(400, 2);
  });

  it("follows a sloped field to the crossing", () => {
    const slope = (x: number) => 0.5 * x;
    const hit = marchTerrainRay(rayOver(100, 0, slope), 10_000);
    expect(hit!).toBeCloseTo(200, 2);
  });

  it("misses where the ray stays above the field or leaves it", () => {
    expect(
      marchTerrainRay(
        rayOver(100, -0.1, () => 0),
        5_000
      )
    ).toBeNull();
    expect(
      marchTerrainRay(
        rayOver(300, PI / 6, (x) => (x < 100 ? 0 : undefined)),
        10_000
      )
    ).toBeNull();
  });

  it("does not start below the field", () => {
    expect(
      marchTerrainRay(
        rayOver(-1, PI / 4, () => 0),
        1_000
      )
    ).toBeNull();
  });

  it("crosses holes in the field as open space", () => {
    const holed = (x: number) => (x > 50 && x < 100 ? undefined : 0);
    const hit = marchTerrainRay(rayOver(150, PI / 4, holed), 1_000);
    expect(hit! * Math.cos(PI / 4)).toBeCloseTo(150, 2);
  });
});

describe("resolveTerrainNormalEnu", () => {
  it("points up on level ground", () => {
    const normal = resolveTerrainNormalEnu(
      { east: 5, west: 5, north: 5, south: 5 },
      1
    )!;
    expect(normal[0]).toBeCloseTo(0, 12);
    expect(normal[1]).toBeCloseTo(0, 12);
    expect(normal[2]).toBeCloseTo(1, 12);
  });

  it("leans away from the uphill side", () => {
    // rises 1 m per metre eastward: the normal leans west at 45 degrees
    const [east, north, up] = resolveTerrainNormalEnu(
      { east: 2, west: 0, north: 1, south: 1 },
      1
    )!;
    expect(east).toBeCloseTo(-Math.SQRT1_2, 12);
    expect(north).toBeCloseTo(0, 12);
    expect(up).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("is null without all four heights", () => {
    expect(
      resolveTerrainNormalEnu(
        { east: 1, west: undefined, north: 1, south: 1 },
        1
      )
    ).toBeNull();
  });
});
