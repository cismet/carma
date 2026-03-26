import { describe, expect, it } from "vitest";
import { Vector3 } from "@carma/math";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { readLocalCameraBasis } from "@carma-commons/camera/model";
import {
  anchoredOrbitToEnuOffset,
  buildAnchoredOrientationQuaternion,
  deriveAnchoredRoll,
} from "./anchoredOrbit";

const meters = (value: number): Meters => value as Meters;
const radians = (degrees: number): Radians =>
  degToRadNumeric(degrees)! as Radians;

describe("anchored orbit helpers", () => {
  it("maps nadir view to a pure upward ENU camera offset", () => {
    const offset = anchoredOrbitToEnuOffset({
      bearing: radians(0),
      pitch: radians(0),
      range: meters(620),
    });

    expect(offset.east).toBeCloseTo(0, 8);
    expect(offset.north).toBeCloseTo(0, 8);
    expect(offset.up).toBeCloseTo(620, 8);
  });

  it("points the camera forward axis back to the anchor for non-zero bearings", () => {
    const orbit = {
      bearing: radians(91.2),
      pitch: radians(45.7),
      range: meters(620),
    };
    const basis = readLocalCameraBasis(
      buildAnchoredOrientationQuaternion(orbit)
    );
    const { east, north, up } = anchoredOrbitToEnuOffset(orbit);
    const toAnchor = new Vector3(-east, -up, north).normalize();

    expect(basis.forward.angleTo(toAnchor)).toBeLessThan(1e-8);
  });

  it("preserves roll through quaternion round-trip", () => {
    const orientation = buildAnchoredOrientationQuaternion({
      bearing: radians(54),
      pitch: radians(42),
      roll: radians(17),
    });
    const derivedRoll = deriveAnchoredRoll({
      orientation,
      bearing: radians(54),
      pitch: radians(42),
    });

    expect(derivedRoll).toBeCloseTo(radians(17), 8);
  });
});
