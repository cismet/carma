import { describe, expect, it } from "vitest";
import { Matrix4, Vector3, Vector4 } from "three";
import {
  cartographicToEcef,
  ecefToEnuMatrix,
  getCameraLocalMercatorFit,
} from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../../core/types";
import {
  imageProjectionMatrix,
  sceneToMercatorPhotoEnu,
  sceneToPhotoEnu,
} from "./image-projection";

const pose: ObliquePose = {
  longitude: 7.2,
  latitude: 51.27,
  z: 700,
  bearingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  direction: [0, 0, -1],
  up: [0, 1, 0],
  utmConvergenceRad: 0,
};
const record = {
  m: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
} as ObliqueImageRecord;
const calibration: ObliqueCameraCalibration = {
  widthPx: 2000,
  heightPx: 1000,
  focalLengthMm: 100,
  principalPointPx: [900, 550],
  halfFovTan: 0.5,
  upMapping: { rowIndex: 1, negate: false },
};
const uv = (matrix: Matrix4, point: Vector3) => {
  const value = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(matrix);
  return [value.x / value.w, value.y / value.w, value.w];
};

describe("calibrated photo-frustum projection", () => {
  it("preserves legacy principal offsets and rejects points behind the photo", () => {
    const camera = new Vector3(10, 100, 20);
    const matrix = imageProjectionMatrix(
      record,
      calibration,
      pose,
      sceneToMercatorPhotoEnu(camera)
    );
    const center = uv(matrix, new Vector3(10, 0, 20));
    expect(center[0]).toBeCloseTo(0.45);
    expect(center[1]).toBeCloseTo(0.45);
    expect(center[2]).toBeGreaterThan(0);
    expect(uv(matrix, new Vector3(10, 200, 20))[2]).toBeLessThan(0);
    const right = uv(matrix, new Vector3(35, 0, 20));
    expect(right[0]).toBeCloseTo(0.7);
    expect(right[1]).toBeCloseTo(0.45);
  });
  it("matches delivered INPHO affine pixels including cross-axis mounting and convergence", () => {
    const camera = {
      ...calibration,
      imageMmToPixelAffine: [
        [0, -10, 900],
        [-20, 0, 550],
      ] as [[number, number, number], [number, number, number]],
    };
    const rotated = { ...pose, utmConvergenceRad: Math.PI / 2 };
    const matrix = imageProjectionMatrix(
      record,
      camera,
      rotated,
      new Matrix4()
    );
    // ENU (10,20,-100) becomes grid (-20,10,-100), image mm (-20,10).
    const point = uv(matrix, new Vector3(10, 20, -100));
    expect(point[0]).toBeCloseTo(800 / 2000);
    expect(point[1]).toBeCloseTo(1 - 950 / 1000);
    expect(point[2]).toBeCloseTo(100);
  });
  it("cancels current local-frame refits for the same physical ECEF point", () => {
    const origin: [number, number] = [7.15, 51.25];
    const photo: [number, number] = [pose.longitude, pose.latitude];
    const ecef = ([lon, lat]: [number, number]) =>
      cartographicToEcef(degToRadNumeric(lon), degToRadNumeric(lat), 0);
    const physical = ecef(photo).add(new Vector3(25, 10, 500));
    const rootEnu = physical
      .clone()
      .applyMatrix4(ecefToEnuMatrix(ecef(origin)));
    const rootScene = new Vector3(rootEnu.x, rootEnu.z, -rootEnu.y);
    const expected = physical
      .clone()
      .applyMatrix4(ecefToEnuMatrix(ecef(photo)))
      .sub(new Vector3(0, 0, pose.z));
    for (const fit of [
      [7.19, 51.26],
      [7.21, 51.28],
    ] as [number, number][]) {
      const sceneFromLocal = getCameraLocalMercatorFit(origin, fit, {
        correctEllipsoidMetric: true,
      });
      const actual = rootScene
        .clone()
        .applyMatrix4(sceneFromLocal)
        .applyMatrix4(sceneToPhotoEnu(origin, sceneFromLocal, pose, pose.z));
      expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    }
  });
});
