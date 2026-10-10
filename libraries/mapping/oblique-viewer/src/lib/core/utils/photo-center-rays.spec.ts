import { describe, expect, it } from "vitest";
import { Matrix4, Ray, Vector3, Vector4 } from "three";
import {
  photoCenterRays,
  photoCenterRayUv,
  photoCentersAtOpticalDepth,
  presentationPointToScene,
  sceneToPresentationPoint,
  screenPointOnPhotoPlane,
} from "./photo-center-rays";

const calibration = { widthPx: 1000, heightPx: 800 };
// Delivered affine with off-centre principal point and cross-axis calibration.
const localProjection = () =>
  new Matrix4().set(
    1,
    0.1,
    -0.4,
    0,
    0.2,
    1,
    -0.65,
    0,
    0,
    0,
    -1,
    0,
    0,
    0,
    -1,
    0
  );
const options = () => ({
  projection: localProjection(),
  sceneToPhoto: new Matrix4(),
  calibration,
  centerY: 0.3,
});
const uv = (projection: Matrix4, ray: Ray) => {
  const point = ray.at(100, new Vector3());
  const value = new Vector4(point.x, point.y, point.z, 1).applyMatrix4(
    projection
  );
  return [value.x / value.w, value.y / value.w];
};
const expectVector = (actual: Vector3, expected: Vector3) =>
  expect(actual.distanceTo(expected)).toBeLessThan(1e-10);

describe("calibrated photo centre rays", () => {
  it("distinguishes the physical axis from the geometric sensor centre without half-pixel drift", () => {
    const input = options();
    const result = photoCenterRays(input);
    expectVector(result.eye, new Vector3());
    expectVector(result.axis!.direction, new Vector3(0, 0, -1));
    expect(
      result.axis!.direction.distanceTo(result.sensor!.direction)
    ).toBeGreaterThan(0.1);
    const axisUV = uv(input.projection, result.axis!);
    expect(axisUV[0]).toBeCloseTo(0.4, 12);
    expect(axisUV[1]).toBeCloseTo(0.65, 12);
    const sensorUV = uv(input.projection, result.sensor!);
    expect(sensorUV[0]).toBeCloseTo(0.5, 12);
    expect(sensorUV[1]).toBeCloseTo(0.5, 12);
    expectVector(result.nadir!.direction, new Vector3(0, 0, -1));
  });
  it.each([
    [0.1, 0.1],
    [0.9, 0.9],
    [-1, 0.1],
    [2, 0.9],
  ])(
    "projects clamped limit %s through principal x and padded sensor y %s",
    (centerY, expected) => {
      const input = { ...options(), centerY };
      const rays = photoCenterRays(input);
      const point = uv(input.projection, rays.preferred!);
      expect(point[0]).toBeCloseTo(0.4, 12);
      expect(point[1]).toBeCloseTo(expected, 12);
      const up = uv(input.projection, rays.preferredUp!);
      expect(up[0]).toBeCloseTo(point[0], 12);
      expect(up[1]).toBeGreaterThan(point[1]);
    }
  );
  it("uses the physical optical axis at 0.5 despite asymmetric principal calibration", () => {
    const input = { ...options(), centerY: 0.5 };
    const rays = photoCenterRays(input);
    expectVector(rays.preferred!.direction, rays.axis!.direction);
    expect(photoCenterRayUv(input.projection, rays.preferred)).toEqual({
      x: 0.4,
      y: 0.65,
    });
    expect(uv(input.projection, rays.preferredUp!)[1]).toBeGreaterThan(0.65);
    expect(uv(input.projection, rays.sensor!)).toEqual([
      expect.closeTo(0.5, 12),
      expect.closeTo(0.5, 12),
    ]);
  });
  it.each([
    [0.3, 0.1],
    [0.7, 0.9],
  ])("interpolates pitch angles, not sensor rows, at %s", (centerY, limitY) => {
    const rays = photoCenterRays({ ...options(), centerY });
    const limit = photoCenterRays({ ...options(), centerY: limitY });
    const angular = (a: Vector3, b: Vector3) =>
      Math.atan2(a.clone().cross(b).length(), a.dot(b));
    expect(
      angular(rays.axis!.direction, rays.preferred!.direction)
    ).toBeCloseTo(
      angular(rays.axis!.direction, limit.preferred!.direction) * 0.5,
      12
    );
    const point = photoCenterRayUv(options().projection, rays.preferred)!;
    expect(point.x).toBeCloseTo(0.4, 12);
    expect(Math.abs(point.y - (0.65 + limitY) * 0.5)).toBeGreaterThan(0.001);
    expect(
      photoCenterRayUv(options().projection, rays.preferredUp)!.y
    ).toBeGreaterThan(point.y);
  });
  it("uses the default reference for invalid parameters and preserves finite normalized rays", () => {
    const actual = photoCenterRays({ ...options(), centerY: NaN });
    const fallback = photoCenterRays({ ...options(), centerY: 0.3 });
    expectVector(actual.preferred!.direction, fallback.preferred!.direction);
    for (const ray of [actual.preferred, actual.preferredUp])
      expect(ray!.direction.length()).toBeCloseTo(1, 12);
    expect(photoCenterRayUv(options().projection, null)).toBeNull();
  });
  it("transforms the eye, calibrated rays and local nadir through the inverse scene frame without mutating inputs", () => {
    const photoToScene = new Matrix4()
      .makeTranslation(30, -80, 140)
      .multiply(new Matrix4().makeRotationX(0.4))
      .multiply(new Matrix4().makeRotationZ(-0.7))
      .multiply(new Matrix4().makeScale(3, 3, 3));
    const sceneToPhoto = photoToScene.clone().invert();
    const projection = localProjection().multiply(sceneToPhoto);
    const before = [sceneToPhoto.clone(), projection.clone()];
    const result = photoCenterRays({ ...options(), sceneToPhoto, projection });
    expectVector(result.eye, new Vector3().applyMatrix4(photoToScene));
    expectVector(
      result.axis!.direction,
      new Vector3(0, 0, -1).transformDirection(photoToScene)
    );
    expectVector(
      result.nadir!.direction,
      new Vector3(0, 0, -1).transformDirection(photoToScene)
    );
    for (const ray of [
      result.axis,
      result.sensor,
      result.preferred,
      result.preferredUp,
      result.nadir,
    ]) {
      expectVector(ray!.origin, result.eye);
      expect(ray!.direction.length()).toBeCloseTo(1, 12);
    }
    const preferredUV = uv(projection, result.preferred!);
    const localPreferredUV = uv(
      localProjection(),
      photoCenterRays(options()).preferred!
    );
    expect(preferredUV[0]).toBeCloseTo(localPreferredUV[0], 12);
    expect(preferredUV[1]).toBeCloseTo(localPreferredUV[1], 12);
    expect(photoCenterRayUv(projection, result.preferred)!.x).toBeCloseTo(
      preferredUV[0],
      12
    );
    expect(photoCenterRayUv(projection, result.preferred)!.y).toBeCloseTo(
      preferredUV[1],
      12
    );
    expect(sceneToPhoto.equals(before[0])).toBe(true);
    expect(projection.equals(before[1])).toBe(true);
    result.sensor!.origin.set(0, 0, 0);
    expectVector(result.eye, new Vector3().applyMatrix4(photoToScene));
  });
  it.each([
    new Matrix4().makeScale(0, 1, 1),
    new Matrix4().makeTranslation(Infinity, 0, 0),
  ])(
    "returns no invalid rays for a singular or non-finite local frame",
    (sceneToPhoto) => {
      const result = photoCenterRays({ ...options(), sceneToPhoto });
      expect(result).toEqual({
        eye: new Vector3(),
        axis: null,
        sensor: null,
        preferred: null,
        preferredUp: null,
        nadir: null,
        axisPitchDeg: null,
        preferredPitchDeg: null,
      });
    }
  );
  it("rejects degenerate ray planes, non-finite projectors and invalid sensor dimensions", () => {
    for (const input of [
      { ...options(), projection: new Matrix4().makeScale(0, 0, 0) },
      { ...options(), projection: new Matrix4().makeTranslation(NaN, 0, 0) },
      { ...options(), calibration: { widthPx: 0, heightPx: 800 } },
    ]) {
      const result = photoCenterRays(input);
      expect(result.eye.toArray().every(Number.isFinite)).toBe(true);
      expect(result.axisPitchDeg).toBeNull();
      expect(result.preferredPitchDeg).toBeNull();
      expect([
        result.axis,
        result.sensor,
        result.preferred,
        result.preferredUp,
        result.nadir,
      ]).toEqual([null, null, null, null, null]);
    }
  });
});

describe("reference ray pitch against photo-local nadir", () => {
  it.each([
    [0.3, 0],
    [0.5, 0],
    [0.7, 0],
    [0.3, 60],
    [0.7, 60],
    [0.7, 180],
  ])(
    "measures the tilted, rolled physical ray at slider %s and roll %s",
    (centerY, rollDeg) => {
      const tilt = Math.PI / 4;
      const roll = (rollDeg * Math.PI) / 180;
      const cameraToPhoto = new Matrix4()
        .makeRotationX(tilt)
        .multiply(new Matrix4().makeRotationZ(roll));
      // Asymmetric principal point; the optical ray is not the sensor midpoint.
      const calibrated = new Matrix4()
        .set(1, 0, -0.4, 0, 0, 1, -0.65, 0, 0, 0, -1, 0, 0, 0, -1, 0)
        .multiply(cameraToPhoto.clone().invert());
      const input = { ...options(), projection: calibrated, centerY };
      const rays = photoCenterRays(input);
      const alpha =
        centerY < 0.5
          ? (-Math.atan(0.55) * (0.5 - centerY)) / 0.4
          : (Math.atan(0.25) * (centerY - 0.5)) / 0.4;
      const expected =
        (Math.acos(
          Math.cos(tilt) * Math.cos(alpha) -
            Math.sin(tilt) * Math.sin(alpha) * Math.cos(roll)
        ) *
          180) /
        Math.PI;
      expect(rays.axisPitchDeg).toBeCloseTo(45, 10);
      expect(rays.preferredPitchDeg).toBeCloseTo(expected, 10);
      if (centerY === 0.5) {
        expect(rays.preferredPitchDeg).toBe(rays.axisPitchDeg);
      } else if (rollDeg === 0) {
        expect(Math.sign(rays.preferredPitchDeg! - rays.axisPitchDeg!)).toBe(
          Math.sign(centerY - 0.5)
        );
      }
      // A translated, rotated and uniformly scaled render frame cannot alter pitch.
      const photoToScene = new Matrix4()
        .makeTranslation(500, -300, 90)
        .multiply(new Matrix4().makeRotationY(0.7))
        .multiply(new Matrix4().makeScale(2, 2, 2));
      const sceneToPhoto = photoToScene.clone().invert();
      const rebased = photoCenterRays({
        ...input,
        sceneToPhoto,
        projection: calibrated.clone().multiply(sceneToPhoto),
      });
      expect(rebased.axisPitchDeg).toBeCloseTo(rays.axisPitchDeg!, 10);
      expect(rebased.preferredPitchDeg).toBeCloseTo(expected, 10);
    }
  );
});

describe("sensor centres on the optical-depth plane", () => {
  it("keeps sensor centre and image-up on one calibrated plane without changing the rays", () => {
    const input = { ...options(), centerY: 0.5 };
    const rays = photoCenterRays(input);
    const axisPoint = rays.axis!.at(125, new Vector3());
    const before = rays.sensor!.clone();
    const result = photoCentersAtOpticalDepth(rays, axisPoint);
    for (const [point, expectedUV] of [
      [result.center, [0.5, 0.5]],
      [result.up, uv(input.projection, rays.preferredUp!)],
    ] as const) {
      expect(point).not.toBeNull();
      expect(
        point!.clone().sub(axisPoint).dot(rays.axis!.direction)
      ).toBeCloseTo(0, 12);
      const projected = new Vector4(
        point!.x,
        point!.y,
        point!.z,
        1
      ).applyMatrix4(input.projection);
      expect(projected.x / projected.w).toBeCloseTo(expectedUV[0], 12);
      expect(projected.y / projected.w).toBeCloseTo(expectedUV[1], 12);
    }
    expect(result.center!.distanceTo(axisPoint)).toBeGreaterThan(1);
    expectVector(rays.sensor!.origin, before.origin);
    expectVector(rays.sensor!.direction, before.direction);
    expectVector(axisPoint, new Vector3(0, 0, -125));
  });

  it("returns null for missing optical axis and parallel or backward centre rays", () => {
    const rays = photoCenterRays(options());
    expect(
      photoCentersAtOpticalDepth(
        { ...rays, axis: null },
        new Vector3(0, 0, -10)
      )
    ).toEqual({ center: null, up: null });
    expect(
      photoCentersAtOpticalDepth(
        {
          ...rays,
          sensor: new Ray(new Vector3(), new Vector3(1, 0, 0)),
          preferredUp: new Ray(new Vector3(), new Vector3(0, 0, 1)),
        },
        new Vector3(0, 0, -10)
      )
    ).toEqual({ center: null, up: null });
  });
});

describe("catalogue-centre presentation boundary", () => {
  it("retains DHHN presentation height through a frame rebase without an implicit geoid shift", () => {
    const point = { longitude: 7.2, latitude: 51.27, heightMeters: 250 };
    const atOrigin = presentationPointToScene(
      point,
      [7.2, 51.27],
      new Matrix4()
    );
    expect(atOrigin.y).toBeCloseTo(250, 6);
    for (const frame of [
      new Matrix4(),
      new Matrix4()
        .makeRotationY(0.3)
        .scale(new Vector3(1.2, 1.1, 1.3))
        .setPosition(40, -10, 70),
    ]) {
      const scene = presentationPointToScene(point, [7.19, 51.26], frame);
      const back = sceneToPresentationPoint(scene, [7.19, 51.26], frame);
      expect(back.longitude).toBeCloseTo(point.longitude, 9);
      expect(back.latitude).toBeCloseTo(point.latitude, 9);
      expect(back.heightMeters).toBeCloseTo(point.heightMeters, 5);
    }
  });
  it("uses a known photo plane for screen coverage, including parallel and behind-camera misses", () => {
    const viewport = { width: 100, height: 80 },
      middle = { x: 50, y: 40 };
    expect(
      screenPointOnPhotoPlane(
        new Matrix4(),
        middle,
        viewport,
        new Vector3(0, 0, 1),
        new Vector3()
      )!.toArray()
    ).toEqual([0, 0, 0]);
    expect(
      screenPointOnPhotoPlane(
        new Matrix4(),
        middle,
        viewport,
        new Vector3(1, 0, 0),
        new Vector3(1, 0, 0)
      )
    ).toBeNull();
    expect(
      screenPointOnPhotoPlane(
        new Matrix4(),
        middle,
        viewport,
        new Vector3(0, 0, 1),
        new Vector3(0, 0, -2)
      )
    ).toBeNull();
  });
});
