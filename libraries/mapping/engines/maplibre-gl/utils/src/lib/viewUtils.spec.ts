import { describe, expect, it } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";

import {
  isMapViewEqualToTarget,
  readMapLibrePerspectiveIntrinsics,
} from "./viewUtils";
const radians = (degrees: number): Radians =>
  degToRadNumeric(degrees)! as Radians;

describe("readMapLibrePerspectiveIntrinsics", () => {
  it("reads vertical fov and derives horizontal fov from the canvas aspect", () => {
    const intrinsics = readMapLibrePerspectiveIntrinsics({
      getCanvas: () =>
        ({
          clientWidth: 1200,
          clientHeight: 800,
        } as HTMLCanvasElement),
      getVerticalFieldOfView: () => 50,
    } as never);

    expect(intrinsics.type).toBe(CAMERA_TYPE.PERSPECTIVE);
    expect(intrinsics.fov).toBeCloseTo(radians(50), 8);
    expect(intrinsics.fovHorizontal).toBeCloseTo(
      2 * Math.atan(Math.tan((radians(50) as number) * 0.5) * 1.5),
      8
    );
    expect(intrinsics.viewOffset).toBeUndefined();
  });
});

describe("isMapViewEqualToTarget", () => {
  it("matches identical center, zoom, bearing, and pitch values", () => {
    const map = {
      getCenter: () => ({ lng: 7.17662, lat: 51.25503 }),
      getZoom: () => 14.93,
      getBearing: () => 91.2,
      getPitch: () => 45.7,
    };

    expect(
      isMapViewEqualToTarget(map as never, {
        center: [7.17662, 51.25503],
        zoom: 14.93,
        bearing: 91.2,
        pitch: 45.7,
      })
    ).toBe(true);
  });

  it("detects mismatching zoom values", () => {
    const map = {
      getCenter: () => ({ lng: 7.17662, lat: 51.25503 }),
      getZoom: () => 14.93,
      getBearing: () => 91.2,
      getPitch: () => 45.7,
    };

    expect(
      isMapViewEqualToTarget(map as never, {
        center: [7.17662, 51.25503],
        zoom: 15.5,
        bearing: 91.2,
        pitch: 45.7,
      })
    ).toBe(false);
  });
});
