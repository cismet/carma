import { WGS84_ELLIPSOID } from "@carma-geo/proj";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  buildOrientationQuaternionFromWorldCameraBasisAtAnchor,
  localYUpSceneDirectionToWorldDirectionAtAnchor,
  readEnuViewAngles,
  worldDirectionToLocalYUpSceneDirectionAtAnchor,
} from "./geospatial-camera-basis";
import { readLocalCameraBasis } from "./local-camera-basis";
describe("geospatial camera basis", () => {
  const anchor = new Vector3(WGS84_ELLIPSOID.semiMajorAxis, 0, 0);

  it("roundtrips local and world directions at an anchor", () => {
    const localDirection = new Vector3(0.3, 0.5, -0.8).normalize();
    const worldDirection = localYUpSceneDirectionToWorldDirectionAtAnchor(
      localDirection,
      anchor
    );
    const roundtripped = worldDirectionToLocalYUpSceneDirectionAtAnchor(
      worldDirection,
      anchor
    );

    expect(roundtripped.distanceTo(localDirection)).toBeLessThan(1e-8);
  });

  it("rebuilds the local orientation from a world camera basis at an anchor", () => {
    const orientation = new Quaternion().setFromAxisAngle(
      new Vector3(0.4, 0.7, -0.2).normalize(),
      0.9
    );
    const localBasis = readLocalCameraBasis(orientation);
    const worldBasis = {
      forward: localYUpSceneDirectionToWorldDirectionAtAnchor(
        localBasis.forward,
        anchor
      ),
      right: localYUpSceneDirectionToWorldDirectionAtAnchor(
        localBasis.right,
        anchor
      ),
      up: localYUpSceneDirectionToWorldDirectionAtAnchor(localBasis.up, anchor),
    };

    const rebuilt = buildOrientationQuaternionFromWorldCameraBasisAtAnchor(
      worldBasis,
      anchor
    );

    expect(rebuilt.angleTo(orientation)).toBeLessThan(1e-8);
  });
});

describe("readEnuViewAngles", () => {
  const axes = {
    east: new Vector3(1, 0, 0),
    north: new Vector3(0, 1, 0),
    up: new Vector3(0, 0, 1),
  };
  const degrees = (direction: Vector3, screenUp: Vector3) => {
    const angles = readEnuViewAngles(
      direction.normalize(),
      screenUp.normalize(),
      axes
    );
    return {
      bearing: radToDegNumeric(angles.bearing),
      pitch: radToDegNumeric(angles.pitch),
      roll: radToDegNumeric(angles.roll),
    };
  };
  const sin = (deg: number) => Math.sin(degToRadNumeric(deg));
  const cos = (deg: number) => Math.cos(degToRadNumeric(deg));

  it("reads straight down with north up as no rotation", () => {
    expect(degrees(new Vector3(0, 0, -1), new Vector3(0, 1, 0))).toEqual({
      bearing: 0,
      pitch: 0,
      roll: 0,
    });
  });

  it("reads the bearing toward the view and the pitch from the nadir", () => {
    const view = degrees(
      new Vector3(sin(60), 0, -cos(60)),
      new Vector3(cos(60), 0, sin(60))
    );
    expect(view.bearing).toBeCloseTo(90, 9);
    expect(view.pitch).toBeCloseTo(60, 9);
    expect(view.roll).toBeCloseTo(0, 9);
  });

  it("reads a turn of screen-up about the view as the roll", () => {
    const view = degrees(
      new Vector3(0, 1, 0),
      new Vector3(sin(15), 0, cos(15))
    );
    expect(view.pitch).toBeCloseTo(90, 9);
    expect(Math.abs(view.roll)).toBeCloseTo(15, 9);
  });
});
