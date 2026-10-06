import { describe, expect, it } from "vitest";
import { Matrix4, PerspectiveCamera, Vector3, Vector4 } from "three";
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
  viewportImageProjection,
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
  it.each([
    { name: "centered", fov: 35, offsetX: 0, offsetY: 0, scale: 1 },
    {
      name: "zoomed and panned",
      fov: 18,
      offsetX: 220,
      offsetY: -130,
      scale: 1,
    },
    {
      name: "wide and off-center composite",
      fov: 65,
      offsetX: -190,
      offsetY: 160,
      scale: 3,
    },
  ])(
    "keeps stationary physical photo rays registered for a mismatched render eye: $name",
    ({ fov, offsetX, offsetY, scale }) => {
      const photo = new PerspectiveCamera(35, 1.5, 1, 5000);
      photo.position.set(120, 800, -150);
      photo.lookAt(100, 0, 200);
      photo.updateMatrixWorld();
      const physical = new Matrix4()
        .set(
          1.4,
          0.03,
          -0.46,
          0,
          -0.02,
          2.1,
          -0.57,
          0,
          0,
          0,
          -1,
          0,
          0,
          0,
          -1,
          0
        )
        .multiply(photo.matrixWorldInverse);
      const directions = [
        [0, 0, -1],
        [0.2, 0.1, -1],
        [-0.25, 0.15, -1],
        [0.25, -0.15, -1],
      ].map(([x, y, z]) =>
        new Vector3(x, y, z).normalize().transformDirection(photo.matrixWorld)
      );
      const expected = directions.map((direction) => {
        const projected = new Vector4(
          direction.x,
          direction.y,
          direction.z,
          0
        ).applyMatrix4(physical);
        return [projected.x / projected.w, projected.y / projected.w];
      });
      const render = photo.clone();
      render.fov = fov;
      // Render-local Mercator refits may differ from the delivered camera eye
      // by centimetres; projection must sample directions, not clip-Z-zero points.
      render.position.add(new Vector3(0.08, 0.06, -0.04));
      render.updateMatrixWorld();
      expect(render.position.distanceTo(photo.position)).toBeGreaterThan(0.1);
      const samples: number[][][] = [];
      for (const [near, far] of [
        [0.1, 2000],
        [1, 5000],
        [20, 20000],
      ]) {
        render.near = near;
        render.far = far;
        render.setViewOffset(1200, 800, offsetX, offsetY, 1200, 800);
        render.updateProjectionMatrix();
        const clip = render.projectionMatrix
          .clone()
          .multiply(render.matrixWorldInverse)
          .multiplyScalar(scale);
        const overlay = viewportImageProjection(physical, clip);
        samples.push(
          directions.map((direction, index) => {
            const projected = new Vector4(
              direction.x,
              direction.y,
              direction.z,
              0
            ).applyMatrix4(clip);
            const screen = new Vector3(
              (projected.x / projected.w + 1) / 2,
              (projected.y / projected.w + 1) / 2,
              1
            ).applyMatrix3(overlay);
            const actual = [screen.x / screen.z, screen.y / screen.z];
            expect(actual.every(Number.isFinite)).toBe(true);
            expect(actual[0]).toBeCloseTo(expected[index][0], 8);
            expect(actual[1]).toBeCloseTo(expected[index][1], 8);
            return actual;
          })
        );
      }
      for (const sample of samples.slice(1))
        sample.forEach((actual, index) =>
          actual.forEach((value, axis) =>
            expect(value).toBeCloseTo(samples[0][index][axis], 8)
          )
        );
    }
  );

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
  it("uses the physical footprint projector for image UVs at every receiver depth", () => {
    const sourceCamera = new PerspectiveCamera(35, 1.5, 1, 5000);
    sourceCamera.position.set(120, 800, -150);
    sourceCamera.lookAt(100, 0, 200);
    sourceCamera.updateMatrixWorld();
    const clip = sourceCamera.projectionMatrix
      .clone()
      .multiply(sourceCamera.matrixWorldInverse);
    // A calibrated sensor with cross-axis terms and an off-center principal point.
    const physical = new Matrix4()
      .set(1.4, 0.03, -0.46, 0, -0.02, 2.1, -0.57, 0, 0, 0, -1, 0, 0, 0, -1, 0)
      .multiply(sourceCamera.matrixWorldInverse);
    const screen = viewportImageProjection(physical, clip);
    const inverse = clip.clone().invert();
    for (const depth of [-0.5, 0.5, 0.99])
      for (const [x, y] of [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
      ]) {
        const world = new Vector3(x * 2 - 1, y * 2 - 1, depth).applyMatrix4(
          inverse
        );
        const footprint = uv(physical, world);
        const image = new Vector3(x, y, 1).applyMatrix3(screen);
        expect(image.x / image.z).toBeCloseTo(footprint[0], 8);
        expect(image.y / image.z).toBeCloseTo(footprint[1], 8);
      }
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
