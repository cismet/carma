import { degToRadNumeric } from "@carma-units";
import { describe, expect, it } from "vitest";

import {
  CESIUM_NADIR_PITCH_RAD,
  computeCesiumPitchDistanceFromNadir,
  fromCarmaViewPitchDegToCesiumPitchRad,
  fromCarmaViewPitchRadToCesiumPitchRad,
  fromCesiumPitchRadToCarmaViewPitchDeg,
  fromCesiumPitchRadToCarmaViewPitchRad,
  isCesiumPitchNearNadir,
} from "./pitch-conventions";

describe("pitch conventions", () => {
  it("maps carma-view nadir pitch to Cesium nadir pitch", () => {
    expect(fromCarmaViewPitchDegToCesiumPitchRad(0)).toBeCloseTo(
      degToRadNumeric(-90)!,
      12
    );
  });

  it("maps carma-view horizon pitch to Cesium horizon pitch", () => {
    expect(fromCarmaViewPitchDegToCesiumPitchRad(90)).toBeCloseTo(0, 12);
  });

  it("maps carma-view pitch radians to Cesium pitch radians", () => {
    expect(
      fromCarmaViewPitchRadToCesiumPitchRad(degToRadNumeric(15)!)
    ).toBeCloseTo(degToRadNumeric(-75)!, 12);
  });

  it("maps Cesium pitch radians to carma-view pitch radians", () => {
    expect(
      fromCesiumPitchRadToCarmaViewPitchRad(degToRadNumeric(-75)!)
    ).toBeCloseTo(degToRadNumeric(15)!, 12);
  });

  it("maps Cesium pitch radians to carma-view pitch degrees", () => {
    expect(
      fromCesiumPitchRadToCarmaViewPitchDeg(degToRadNumeric(-30)!)
    ).toBeCloseTo(60, 12);
  });

  it("computes distance from Cesium nadir in carma-view radians", () => {
    expect(computeCesiumPitchDistanceFromNadir(CESIUM_NADIR_PITCH_RAD)).toBe(0);
    expect(
      computeCesiumPitchDistanceFromNadir(degToRadNumeric(-45)!)
    ).toBeCloseTo(degToRadNumeric(45)!, 12);
  });

  it("detects Cesium nadir proximity via carma-view pitch distance", () => {
    expect(
      isCesiumPitchNearNadir(degToRadNumeric(-80)!, degToRadNumeric(15)!)
    ).toBe(true);
    expect(
      isCesiumPitchNearNadir(
        fromCarmaViewPitchDegToCesiumPitchRad(90)!,
        degToRadNumeric(15)!
      )
    ).toBe(false);
  });
});
