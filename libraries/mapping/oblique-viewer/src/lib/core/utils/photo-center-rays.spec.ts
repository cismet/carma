import { describe, expect, it } from "vitest";
import { Matrix4, Ray, Vector3, Vector4 } from "three";
import { degToRadNumeric, radToDegNumeric, type Degrees } from "@carma-units";
import {
  photoCenterRays,
  photoReferenceRays,
  photoCenterRayUv,
  photoCenterParameterForPitch,
  photoCentersAtOpticalDepth,
  presentationPointToScene,
  sceneToPresentationPoint,
  screenPointOnPhotoPlane,
} from "./photo-center-rays";

import { objectCoveragePixelRay } from "./object-coverage";

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

describe("shared photo reference rays", () => {
  it("retains the native principal-column policy when heading is omitted", () => {
    const input = options();
    const pitchDeg = 12 as Degrees;
    const centerY = photoCenterParameterForPitch(input, pitchDeg)!;
    const original = photoCenterRays({ ...input, centerY });
    const result = photoReferenceRays(input, { pitchDeg });
    expectVector(result.preferred!.direction, original.preferred!.direction);
    expectVector(
      result.preferredUp!.direction,
      original.preferredUp!.direction
    );
    expectVector(result.axis!.direction, original.axis!.direction);
  });

  it("matches geographic pitch and heading with both calibrated sensor coordinates", () => {
    const input = options();
    const result = photoReferenceRays(input, {
      pitchDeg: 12 as Degrees,
      headingDeg: 35 as Degrees,
    });
    const p = degToRadNumeric(12),
      h = degToRadNumeric(35);
    expectVector(
      result.preferred!.direction,
      new Vector3(
        Math.sin(p) * Math.sin(h),
        Math.sin(p) * Math.cos(h),
        -Math.cos(p)
      )
    );
    expect(result.preferredPitchDeg).toBeCloseTo(12, 10);
    const point = photoCenterRayUv(input.projection, result.preferred)!;
    const up = photoCenterRayUv(input.projection, result.preferredUp)!;
    expect(point.x).not.toBeCloseTo(0.4, 3);
    expect(up.x).toBeCloseTo(point.x, 12);
    expect(up.y - point.y).toBeCloseTo(1 / calibration.heightPx, 12);
  });

  it("uses true-north ENU through a transformed frame without changing the image pose", () => {
    const photoToScene = new Matrix4()
      .makeTranslation(30, -80, 140)
      .multiply(new Matrix4().makeRotationX(0.4))
      .multiply(new Matrix4().makeRotationZ(-0.7));
    const sceneToPhoto = photoToScene.clone().invert();
    const projection = localProjection().multiply(sceneToPhoto);
    const saved = [sceneToPhoto.clone(), projection.clone()];
    const result = photoReferenceRays(
      { projection, sceneToPhoto, calibration },
      {
        pitchDeg: 8 as Degrees,
        headingDeg: 45 as Degrees,
      }
    );
    const local = result
      .preferred!.direction.clone()
      .transformDirection(sceneToPhoto);
    expect(radToDegNumeric(Math.atan2(local.x, local.y))).toBeCloseTo(45, 10);
    expect(radToDegNumeric(Math.acos(-local.z))).toBeCloseTo(8, 10);
    expectVector(result.eye, new Vector3().applyMatrix4(photoToScene));
    expect(sceneToPhoto.equals(saved[0])).toBe(true);
    expect(projection.equals(saved[1])).toBe(true);
  });

  it("retains a reachable full-sensor ray outside the legacy ten-percent padding", () => {
    const input = options();
    const target = objectCoveragePixelRay(
      input.projection,
      new Vector3(),
      {
        x: 0.04 * calibration.widthPx,
        y: 0.5 * calibration.heightPx,
      } as Parameters<typeof objectCoveragePixelRay>[2],
      calibration
    )!;
    const result = photoReferenceRays(input, {
      pitchDeg: radToDegNumeric(Math.acos(-target.direction.z)) as Degrees,
      headingDeg: radToDegNumeric(
        Math.atan2(target.direction.x, target.direction.y)
      ) as Degrees,
    });
    expectVector(result.preferred!.direction, target.direction);
    expect(photoCenterRayUv(input.projection, result.preferred)!.x).toBeCloseTo(
      0.04,
      12
    );
  });

  it("clamps an unreachable direction angularly to a sensor edge rather than a UV corner", () => {
    const input = options();
    const result = photoReferenceRays(input, {
      pitchDeg: 70 as Degrees,
      headingDeg: 90 as Degrees,
    });
    const point = photoCenterRayUv(input.projection, result.preferred)!;
    expect(point.x).toBeCloseTo(1, 10);
    expect(point.y).toBeGreaterThan(0.5);
    expect(point.y).toBeLessThan(0.9);
    expect(result.preferred!.direction.z).toBeLessThan(0);
    const requested = new Vector3(
      Math.sin(degToRadNumeric(70)),
      0,
      -Math.cos(degToRadNumeric(70))
    );
    const corner = objectCoveragePixelRay(
      input.projection,
      new Vector3(),
      {
        x: calibration.widthPx,
        y: 0,
      } as Parameters<typeof objectCoveragePixelRay>[2],
      calibration
    )!;
    expect(result.preferred!.direction.dot(requested)).toBeGreaterThan(
      corner.direction.dot(requested)
    );
  });

  it.each([
    { pitchDeg: NaN, headingDeg: 0 },
    { pitchDeg: -1, headingDeg: 0 },
    { pitchDeg: 91, headingDeg: 0 },
    { pitchDeg: 45, headingDeg: Infinity },
  ])(
    "rejects invalid preferences %j without changing calibrated source rays",
    (preference) => {
      const result = photoReferenceRays(
        options(),
        preference as { pitchDeg: Degrees; headingDeg: Degrees }
      );
      expect(result.axis).not.toBeNull();
      expect(result.preferred).toBeNull();
      expect(result.preferredUp).toBeNull();
      expect(result.preferredPitchDeg).toBeNull();
    }
  );
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

describe("absolute principal-column pitch inversion", () => {
  const calibratedOptions = (
    tiltDeg = 45,
    rollDeg = 0,
    focalScale = 1,
    principalX = 0.4,
    principalY = 0.65,
    skew = 0
  ) => ({
    ...options(),
    projection: new Matrix4()
      .set(
        focalScale,
        skew,
        -principalX,
        0,
        skew * 0.5,
        focalScale,
        -principalY,
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
      .multiply(
        new Matrix4()
          .makeRotationX((tiltDeg * Math.PI) / 180)
          .multiply(new Matrix4().makeRotationZ((rollDeg * Math.PI) / 180))
          .invert()
      ),
  });

  it.each([
    [0.15, 0],
    [0.35, 0],
    [0.5, 0],
    [0.75, 0],
    [0.88, 0],
    [0.2, 180],
    [0.7, 180],
  ])(
    "roundtrips angular parameter %s with camera roll %s",
    (parameter, roll) => {
      const input = calibratedOptions(45, roll);
      const desired = photoCenterRays({ ...input, centerY: parameter })
        .preferredPitchDeg!;
      const solved = photoCenterParameterForPitch(input, desired as Degrees);
      expect(solved).toBeCloseTo(parameter, 9);
      expect(
        photoCenterRays({ ...input, centerY: solved! }).preferredPitchDeg
      ).toBeCloseTo(desired, 9);
    }
  );

  it.each([60, 90])(
    "roundtrips physical pitch for non-monotonic or symmetric roll %s",
    (roll) => {
      const input = calibratedOptions(45, roll);
      const center = photoCenterRays({ ...input, centerY: 0.5 });
      const requested = photoCenterRays({ ...input, centerY: 0.2 });
      const solved = photoCenterParameterForPitch(
        input,
        requested.preferredPitchDeg! as Degrees
      );
      expect(solved).not.toBeNull();
      const actual = photoCenterRays({ ...input, centerY: solved! });
      expect(actual.preferredPitchDeg).toBeCloseTo(
        requested.preferredPitchDeg!,
        9
      );
      expect(
        actual.axis!.direction.angleTo(actual.preferred!.direction)
      ).toBeLessThanOrEqual(
        center.axis!.direction.angleTo(requested.preferred!.direction) + 1e-10
      );
    }
  );

  it("uses the actual off-axis, skewed principal column and preserves projection inputs", () => {
    const input = calibratedOptions(50, 35, 1.2, 0.32, 0.7, 0.18);
    const beforeProjection = input.projection.clone();
    const beforeFrame = input.sceneToPhoto.clone();
    const desired = photoCenterRays({ ...input, centerY: 0.32 })
      .preferredPitchDeg!;
    const solved = photoCenterParameterForPitch(input, desired as Degrees);
    const actual = photoCenterRays({ ...input, centerY: solved! });
    expect(actual.preferredPitchDeg).toBeCloseTo(desired, 9);
    expect(photoCenterRayUv(input.projection, actual.preferred)!.x).toBeCloseTo(
      photoCenterRayUv(input.projection, actual.axis)!.x,
      12
    );
    expect(input.projection.equals(beforeProjection)).toBe(true);
    expect(input.sceneToPhoto.equals(beforeFrame)).toBe(true);
  });

  it.each([
    [0, 0, 0.1],
    [85, 0, 0.9],
    [85, 180, 0.1],
  ])(
    "clamps unattainable pitch %s at roll %s to nearest padded endpoint %s",
    (desired, roll, endpoint) => {
      expect(
        photoCenterParameterForPitch(
          calibratedOptions(45, roll),
          desired as Degrees
        )
      ).toBeCloseTo(endpoint, 12);
    }
  );

  it("uses an internal stationary pitch when it is closer than either padded endpoint", () => {
    const input = calibratedOptions(45, 60, 1, 0.4, 0.9);
    const solved = photoCenterParameterForPitch(input, 0 as Degrees)!;
    expect(solved).toBeGreaterThan(0.1);
    expect(solved).toBeLessThan(0.5);
    const achieved = photoCenterRays({ ...input, centerY: solved })
      .preferredPitchDeg!;
    for (const parameter of [0.1, 0.5, 0.9, solved - 0.001, solved + 0.001])
      expect(
        photoCenterRays({ ...input, centerY: parameter }).preferredPitchDeg!
      ).toBeGreaterThan(achieved);
  });

  it("keeps one active-camera pitch fixed across different candidate calibration and roll", () => {
    const active = calibratedOptions();
    const desired = photoCenterRays({ ...active, centerY: 0.5 })
      .axisPitchDeg! as Degrees;
    expect(photoCenterParameterForPitch(active, desired)).toBe(0.5);
    for (const input of [
      calibratedOptions(55, 0, 1.4, 0.52, 0.7),
      calibratedOptions(40, 180, 0.8, 0.3, 0.4),
    ]) {
      const solved = photoCenterParameterForPitch(input, desired);
      expect(solved).not.toBeNull();
      expect(solved).not.toBe(0.5);
      expect(
        photoCenterRays({ ...input, centerY: solved! }).preferredPitchDeg
      ).toBeCloseTo(desired, 9);
    }
  });

  it.each([NaN, Infinity, -1, 120])(
    "rejects unsupported ground pitch %s",
    (desired) => {
      expect(
        photoCenterParameterForPitch(calibratedOptions(), desired as Degrees)
      ).toBeNull();
    }
  );

  it.each([
    [45, 0, 0.9],
    [45, 180, 0.1],
    [89, 0, 0.5],
    [90, 0, 0.1],
  ])(
    "clamps a horizon preference at tilt %s and roll %s to downward parameter %s",
    (tilt, roll, expected) => {
      const input = calibratedOptions(tilt, roll);
      const solved = photoCenterParameterForPitch(input, 90 as Degrees);
      expect(solved).toBeCloseTo(expected, 10);
      expect(
        photoCenterRays({ ...input, centerY: solved! }).preferredPitchDeg!
      ).toBeLessThan(90);
    }
  );

  it("returns null for invalid calibration/frame or a wholly upward principal column", () => {
    expect(
      photoCenterParameterForPitch(
        { ...options(), sceneToPhoto: new Matrix4().makeScale(0, 1, 1) },
        45 as Degrees
      )
    ).toBeNull();
    expect(
      photoCenterParameterForPitch(
        { ...options(), calibration: { widthPx: 0, heightPx: 800 } },
        45 as Degrees
      )
    ).toBeNull();
    expect(
      photoCenterParameterForPitch(calibratedOptions(140), 45 as Degrees)
    ).toBeNull();
  });
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
