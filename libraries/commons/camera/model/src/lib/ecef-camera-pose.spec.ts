import { describe, expect, it } from "vitest";
import {
  cartographicToEcef,
  ecefToCartographic,
  readEnuAxesAtEcef,
} from "@carma-geo/proj";
import { degToRadNumeric, type Radians } from "@carma-units";

import {
  createLookAtEcefCameraPose,
  interpolateEcefCameraPose,
  type EcefCameraPose,
} from "./ecef-camera-pose";

const at = (longitudeDeg: number, latitudeDeg: number, altitude: number) =>
  cartographicToEcef(
    degToRadNumeric(longitudeDeg),
    degToRadNumeric(latitudeDeg),
    altitude
  );

const target = at(7.2, 51.272, 155);
const fov = (value: number) => value as Radians;

const expectOrthonormal = (pose: EcefCameraPose) => {
  expect(pose.directionECEF.length()).toBeCloseTo(1, 9);
  expect(pose.upECEF.length()).toBeCloseTo(1, 9);
  expect(pose.directionECEF.dot(pose.upECEF)).toBeCloseTo(0, 9);
};

const expectSamePose = (a: EcefCameraPose, b: EcefCameraPose) => {
  expect(a.positionECEF.distanceTo(b.positionECEF)).toBeLessThan(1e-6);
  expect(a.directionECEF.angleTo(b.directionECEF)).toBeLessThan(1e-6);
  expect(a.upECEF.angleTo(b.upECEF)).toBeLessThan(1e-6);
  expect(a.verticalFovRad).toBeCloseTo(b.verticalFovRad, 9);
};

describe("createLookAtEcefCameraPose", () => {
  it("looks at the target, upright", () => {
    const pose = createLookAtEcefCameraPose(
      at(7.2, 51.271, 300),
      target,
      fov(0.8)
    )!;
    expectOrthonormal(pose);
    expect(
      pose.directionECEF.angleTo(target.clone().sub(pose.positionECEF))
    ).toBeLessThan(1e-9);
    expect(
      pose.upECEF.dot(readEnuAxesAtEcef(pose.positionECEF).up)
    ).toBeGreaterThan(0.5);
  });

  it("points screen-up north when looking straight down", () => {
    const eye = at(7.2, 51.272, 655);
    const pose = createLookAtEcefCameraPose(eye, target)!;
    expectOrthonormal(pose);
    expect(pose.upECEF.angleTo(readEnuAxesAtEcef(eye).north)).toBeLessThan(
      0.01
    );
  });

  it("has no pose for an eye on the target", () => {
    expect(createLookAtEcefCameraPose(target, target.clone())).toBeNull();
  });
});

describe("interpolateEcefCameraPose", () => {
  const from = createLookAtEcefCameraPose(
    at(7.19, 51.27, 400),
    target,
    fov(0.6)
  )!;
  const to = createLookAtEcefCameraPose(
    at(7.21, 51.275, 250),
    target,
    fov(1.0)
  )!;

  it("starts and ends on the two poses", () => {
    expectSamePose(interpolateEcefCameraPose(from, to, 0), from);
    expectSamePose(interpolateEcefCameraPose(from, to, 1), to);
  });

  it("moves along the ellipsoid and turns between the two orientations", () => {
    const middle = interpolateEcefCameraPose(from, to, 0.5);
    expectOrthonormal(middle);
    expect(ecefToCartographic(middle.positionECEF).altitude).toBeCloseTo(
      325,
      3
    );
    expect(middle.verticalFovRad).toBeCloseTo(0.8, 9);
    const turn = from.directionECEF.angleTo(to.directionECEF);
    expect(from.directionECEF.angleTo(middle.directionECEF)).toBeLessThan(turn);
    expect(middle.directionECEF.angleTo(to.directionECEF)).toBeLessThan(turn);
  });
});
