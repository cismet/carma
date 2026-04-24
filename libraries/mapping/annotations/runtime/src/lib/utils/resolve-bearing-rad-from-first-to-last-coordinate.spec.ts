import { PI, PI_OVER_TWO } from "@carma-units";
import { describe, expect, it } from "vitest";
import type { CesiumGeographicCoordinate } from "../store/annotations-store.types";
import { resolveBearingRadFromFirstToLastCoordinate } from "./resolve-bearing-rad-from-first-to-last-coordinate";

const createCoordinate = (
  overrides: Partial<CesiumGeographicCoordinate> = {}
): CesiumGeographicCoordinate => ({
  longitude: 0,
  latitude: 0,
  altitude: 0,
  ...overrides,
});

describe("resolveBearingRadFromFirstToLastCoordinate", () => {
  it("returns 0 rad for northbound segments", () => {
    expect(
      resolveBearingRadFromFirstToLastCoordinate([
        createCoordinate(),
        createCoordinate({ latitude: 0.001 }),
      ])
    ).toBeCloseTo(0, 5);
  });

  it("returns pi/2 rad for eastbound segments", () => {
    expect(
      resolveBearingRadFromFirstToLastCoordinate([
        createCoordinate(),
        createCoordinate({ longitude: 0.001 }),
      ])
    ).toBeCloseTo(PI_OVER_TWO, 5);
  });

  it("returns pi rad for southbound segments", () => {
    expect(
      resolveBearingRadFromFirstToLastCoordinate([
        createCoordinate(),
        createCoordinate({ latitude: -0.001 }),
      ])
    ).toBeCloseTo(PI, 5);
  });

  it("returns null when no horizontal direction can be resolved", () => {
    expect(
      resolveBearingRadFromFirstToLastCoordinate([
        createCoordinate(),
        createCoordinate({ altitude: 10 }),
      ])
    ).toBeNull();
  });
});
