import { describe, expect, it } from "vitest";
import { Vector3 } from "@carma/math";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import {
  buildObjectCentricOrientationQuaternion,
  buildObjectCentricOrientationQuaternionFromBasis,
  deriveObjectCentricRoll,
  enuOffsetToObjectCentricOrbit,
  objectCentricOrbitToEnuOffset,
  readObjectCentricCameraBasis,
} from "./object-centric-camera-conversions";

const meters = (value: number): Meters => value as Meters;
const radians = (degrees: number): Radians =>
  degToRadNumeric(degrees)! as Radians;

describe("object-centric camera conversions", () => {
  it("maps nadir view to a pure upward ENU camera offset", () => {
    const offset = objectCentricOrbitToEnuOffset({
      bearing: radians(0),
      pitch: radians(0),
      range: meters(620),
    });

    expect(offset.east).toBeCloseTo(0, 8);
    expect(offset.north).toBeCloseTo(0, 8);
    expect(offset.up).toBeCloseTo(620, 8);
  });

  it("round-trips orbit values through ENU offsets", () => {
    const orbit = {
      bearing: radians(54),
      pitch: radians(42),
      range: meters(620),
    };

    const roundTrip = enuOffsetToObjectCentricOrbit(
      objectCentricOrbitToEnuOffset(orbit)
    );

    expect(roundTrip.bearing).toBeCloseTo(orbit.bearing, 8);
    expect(roundTrip.pitch).toBeCloseTo(orbit.pitch, 8);
    expect(roundTrip.range).toBeCloseTo(orbit.range, 8);
  });

  it("canonicalizes nadir orbit bearing to zero instead of 180", () => {
    const roundTrip = enuOffsetToObjectCentricOrbit({
      east: 0,
      north: 0,
      up: 620,
    });

    expect(roundTrip.bearing).toBeCloseTo(radians(0), 8);
    expect(roundTrip.pitch).toBeCloseTo(radians(0), 8);
    expect(roundTrip.range).toBeCloseTo(meters(620), 8);
  });

  it("reads the expected basis for a nadir orientation", () => {
    const basis = readObjectCentricCameraBasis(
      buildObjectCentricOrientationQuaternion({
        bearing: radians(0),
        pitch: radians(0),
      })
    );

    expect(basis.forward.distanceTo(new Vector3(0, -1, 0))).toBeLessThan(1e-8);
    expect(basis.up.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-8);
    expect(basis.right.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-8);
  });

  it("points the camera forward axis back to the anchor for non-zero bearings", () => {
    const orbit = {
      bearing: radians(91.2),
      pitch: radians(45.7),
      range: meters(620),
    };
    const basis = readObjectCentricCameraBasis(
      buildObjectCentricOrientationQuaternion(orbit)
    );
    const { east, north, up } = objectCentricOrbitToEnuOffset(orbit);
    const toAnchor = new Vector3(-east, -up, north).normalize();

    expect(basis.forward.angleTo(toAnchor)).toBeLessThan(1e-8);
  });

  it("preserves roll through quaternion round-trip", () => {
    const orientation = buildObjectCentricOrientationQuaternion({
      bearing: radians(54),
      pitch: radians(42),
      roll: radians(17),
    });
    const derivedRoll = deriveObjectCentricRoll({
      orientation,
      bearing: radians(54),
      pitch: radians(42),
    });

    expect(derivedRoll).toBeCloseTo(radians(17), 8);
  });

  it("rebuilds a matching quaternion from a camera basis", () => {
    const orientation = buildObjectCentricOrientationQuaternion({
      bearing: radians(91),
      pitch: radians(27),
      roll: radians(-23),
    });
    const basis = readObjectCentricCameraBasis(orientation);
    const rebuilt = buildObjectCentricOrientationQuaternionFromBasis(basis);

    expect(rebuilt.angleTo(orientation)).toBeLessThan(1e-8);
  });
});
