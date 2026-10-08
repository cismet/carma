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
} from "../types";
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

  it.each([
    {
      name: "same photo eye",
      translation: [0, 0, 0],
      fov: 35,
      pan: [0, 0],
      scale: 1,
    },
    {
      name: "translated orbit and panned view",
      translation: [160, -120, 230],
      fov: 18,
      pan: [220, -130],
      scale: 1,
    },
    {
      name: "scaled projection with changed heading",
      translation: [-190, 180, -220],
      fov: 65,
      pan: [-190, 160],
      scale: 3,
    },
  ])(
    "registers finite anchor depth and its plane for $name",
    ({ translation, fov, pan, scale }) => {
      const photo = new PerspectiveCamera(35, 1.5, 1, 5000);
      photo.position.set(120, 800, -150);
      photo.lookAt(100, 0, 200);
      photo.rotateZ(0.17);
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
      const anchor = new Vector3(100, 0, 200);
      const render = photo.clone();
      render.position.add(new Vector3(...translation));
      render.lookAt(anchor.clone().add(new Vector3(40, 25, -30)));
      render.rotateZ(-0.12);
      render.fov = fov;
      render.updateMatrixWorld();
      const sceneFromLocal = new Matrix4()
        .makeTranslation(1100, -800, 600)
        .multiply(new Matrix4().makeRotationY(0.43))
        .multiply(new Matrix4().makeScale(scale, scale, scale));
      const localFromScene = sceneFromLocal.clone().invert();
      const scenePhoto = physical.clone().multiply(localFromScene);
      const sceneAnchor = anchor.clone().applyMatrix4(sceneFromLocal);
      const planeX = new Vector3().setFromMatrixColumn(photo.matrixWorld, 0);
      const planeY = new Vector3().setFromMatrixColumn(photo.matrixWorld, 1);
      const worldPoints = [
        [0, 0],
        [100, 0],
        [0, 100],
        [-170, 130],
        [140, -120],
      ].map(([x, y]) =>
        anchor
          .clone()
          .addScaledVector(planeX, x)
          .addScaledVector(planeY, y)
          .applyMatrix4(sceneFromLocal)
      );
      for (const [near, far] of [
        [0.1, 2000],
        [20, 20000],
      ]) {
        render.near = near;
        render.far = far;
        render.setViewOffset(1200, 800, pan[0], pan[1], 1200, 800);
        render.updateProjectionMatrix();
        const clip = render.projectionMatrix
          .clone()
          .multiply(render.matrixWorldInverse)
          .multiply(localFromScene)
          .multiplyScalar(scale);
        const overlay = viewportImageProjection(scenePhoto, clip, sceneAnchor);
        const directionOnly = viewportImageProjection(scenePhoto, clip);
        for (const world of worldPoints) {
          const screen = world.clone().applyMatrix4(clip);
          const screenUv = new Vector3(
            (screen.x + 1) / 2,
            (screen.y + 1) / 2,
            1
          );
          const actual = screenUv.clone().applyMatrix3(overlay);
          const expected = uv(scenePhoto, world);
          expect(actual.x / actual.z).toBeCloseTo(expected[0], 8);
          expect(actual.y / actual.z).toBeCloseTo(expected[1], 8);
          if (translation.every((value) => value === 0)) {
            const legacy = screenUv.clone().applyMatrix3(directionOnly);
            expect(actual.x / actual.z).toBeCloseTo(legacy.x / legacy.z, 8);
            expect(actual.y / actual.z).toBeCloseTo(legacy.y / legacy.z, 8);
          }
        }
      }
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
