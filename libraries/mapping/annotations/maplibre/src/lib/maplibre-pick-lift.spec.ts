import {
  MAPLIBRE_PICK_LIFT_DEFAULTS,
  resolvePickLiftMeters,
} from "./maplibre-pick-lift";

describe("resolvePickLiftMeters", () => {
  it("grows with the distance to the camera", () => {
    expect(resolvePickLiftMeters(35)).toBeCloseTo(0.0035, 9);
  });

  it("never goes below half a millimetre or into the centimetres", () => {
    expect(resolvePickLiftMeters(0.5)).toBe(
      MAPLIBRE_PICK_LIFT_DEFAULTS.minMeters
    );
    expect(resolvePickLiftMeters(5_000)).toBe(
      MAPLIBRE_PICK_LIFT_DEFAULTS.maxMeters
    );
    expect(MAPLIBRE_PICK_LIFT_DEFAULTS.maxMeters).toBeLessThan(0.01);
    expect(resolvePickLiftMeters(Number.NaN)).toBe(
      MAPLIBRE_PICK_LIFT_DEFAULTS.minMeters
    );
  });
});
