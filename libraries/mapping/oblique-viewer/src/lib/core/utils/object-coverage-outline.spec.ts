import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { TWO_PI } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../types";
import { imageProjectionMatrix, sceneToPhotoEnu } from "./image-projection";
import {
  objectCoveragePixelRay,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "./object-coverage";
import { projectObjectCoverageOutline } from "./object-coverage-outline";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";

const referenceSphere: ObjectCoverageSphere = {
  center: { longitude: 7.2, latitude: 51.27, heightMeters: 10 },
  radiusMeters: 12,
};
const center = new Vector3(0, 10, 0);
const calibrationOf = (affine: boolean): ObliqueCameraCalibration => ({
  widthPx: 1600,
  heightPx: 1200,
  focalLengthMm: 10,
  principalPointPx: [817.25, 581.75],
  halfFovTan: 1.5,
  upMapping: { rowIndex: 1, negate: false },
  imageMmToPixelAffine: affine
    ? [
        [80, 3, 817.25],
        [2, -76, 581.75],
      ]
    : undefined,
});
const imageOf = (
  heading = 0,
  affine = false,
  nadir = false
): ObjectCoverageImage => {
  const angle = (heading / 4) * TWO_PI;
  const direction = nadir
    ? new Vector3(0, 0, -1)
    : new Vector3(Math.sin(angle) * 0.6, Math.cos(angle) * 0.6, -0.8);
  const up = nadir
    ? new Vector3(0, 1, 0)
    : new Vector3(
        Math.sin(angle) * 0.8,
        Math.cos(angle) * 0.8,
        0.6
      ).applyAxisAngle(direction, 0.37 + heading * 0.08);
  const right = new Vector3().crossVectors(direction, up).normalize();
  const pose: ObliquePose = {
    longitude: referenceSphere.center.longitude,
    latitude: referenceSphere.center.latitude,
    z: 100,
    bearingDeg: heading * 90,
    pitchDeg: nadir ? 90 : 53.13,
    rollDeg: 0,
    direction: direction.toArray(),
    up: up.toArray(),
    utmConvergenceRad: 0,
  };
  const record: ObliqueImageRecord = {
    id: `camera-${heading}`,
    seriesId: TEST_LEGACY_SERIES.id,
    sourceId: "synthetic",
    cameraId: "camera",
    x: 0,
    y: 0,
    z: 100,
    centerWGS84: [pose.longitude, pose.latitude, 100],
    m: [right.toArray(), up.toArray(), direction.clone().negate().toArray()],
    fallbackHeading: heading * 90,
    sector: 0,
    pose,
  };
  const calibration = calibrationOf(affine);
  const frame = sceneToPhotoEnu(
    [referenceSphere.center.longitude, referenceSphere.center.latitude],
    new Matrix4(),
    pose,
    100
  );
  return {
    record,
    dataset: { ...TEST_LEGACY_SERIES, cameras: { camera: calibration } },
    projection: imageProjectionMatrix(record, calibration, pose, frame),
    cameraAltitudeMeters: 100,
    pixelsPerMeter: 6,
    crop: { x: 230, y: 145, width: 550, height: 310 },
  };
};
const eyeOf = (image: ObjectCoverageImage) =>
  new Vector3().applyMatrix4(
    sceneToPhotoEnu(
      [referenceSphere.center.longitude, referenceSphere.center.latitude],
      new Matrix4(),
      image.record.pose!,
      image.cameraAltitudeMeters!
    ).invert()
  );

describe("projectObjectCoverageOutline", () => {
  it("projects the perspective tangent circle rather than the sphere's equator", () => {
    const image = imageOf(0, false, true);
    const calibration = calibrationOf(false);
    const radius = 12;
    const outline = projectObjectCoverageOutline(
      image,
      referenceSphere,
      center,
      radius
    )!;
    const distance = eyeOf(image).distanceTo(center);
    const focal =
      Math.max(calibration.widthPx, calibration.heightPx) /
      (2 * calibration.halfFovTan);
    const expectedRadius =
      (focal * radius) / Math.sqrt(distance ** 2 - radius ** 2);
    expect(outline).toHaveLength(48);
    for (const point of outline) {
      expect(Math.hypot(point.x - 817.75, point.y - 582.25)).toBeCloseTo(
        expectedRadius,
        6
      );
    }
    expect(expectedRadius).toBeGreaterThan((focal * radius) / distance);
  });

  it.each(
    [false, true].flatMap((affine) =>
      [0, 1, 2, 3].map((heading) => ({ affine, heading }))
    )
  )(
    "returns 48 closed-loop tangent rays for heading $heading, affine $affine, roll and a shifted 3D centre",
    ({ affine, heading }) => {
      const image = imageOf(heading, affine);
      const shifted = new Vector3(9, 18, -6);
      const radius = 7;
      const outline = projectObjectCoverageOutline(
        image,
        referenceSphere,
        shifted,
        radius
      )!;
      expect(image.projection!.determinant()).toBeCloseTo(0, 12);
      expect(outline).toHaveLength(48);
      expect(new Set(outline.map(({ x, y }) => `${x},${y}`)).size).toBe(48);
      const eye = eyeOf(image);
      const points = outline.map((pixel) => {
        expect([pixel.x, pixel.y].every(Number.isFinite)).toBe(true);
        const ray = objectCoveragePixelRay(
          image.projection!,
          eye,
          pixel,
          calibrationOf(affine)
        )!;
        expect(ray).not.toBeNull();
        const distance = shifted.clone().sub(eye).dot(ray.direction);
        expect(distance).toBeGreaterThan(0);
        const tangent = ray.at(distance, new Vector3());
        expect(tangent.distanceTo(shifted)).toBeCloseTo(radius, 7);
        expect(tangent.clone().sub(shifted).dot(ray.direction)).toBeCloseTo(
          0,
          8
        );
        return tangent;
      });
      const chord = points[0].distanceTo(points[1]);
      points.forEach((point, index) => {
        expect(
          point.distanceTo(points[(index + 1) % points.length])
        ).toBeCloseTo(chord, 7);
      });
    }
  );

  it("retains native sensor coordinates independently of the displayed crop", () => {
    const image = imageOf();
    expect(
      projectObjectCoverageOutline(
        { ...image, crop: { x: -20, y: 500, width: 20, height: 30 } },
        referenceSphere,
        center,
        12
      )
    ).toEqual(projectObjectCoverageOutline(image, referenceSphere, center, 12));
  });

  it("rejects a horizon crossing between sampled contour vertices", () => {
    const image = imageOf(0, false, true);
    const eye = eyeOf(image);
    const axis = eye.clone().sub(center);
    const ratio = 12 ** 2 / axis.lengthSq();
    const ringCenter = center.clone().addScaledVector(axis, ratio);
    const ringRadius = 12 * Math.sqrt(1 - ratio);
    axis.normalize();
    const right = new Vector3(1, 0, 0).cross(axis).normalize();
    const up = axis.clone().cross(right);
    const angle = TWO_PI / 96;
    const depthAxis = right
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(up, Math.sin(angle));
    const projection = image.projection!.clone();
    const e = projection.elements;
    e[3] = depthAxis.x;
    e[7] = depthAxis.y;
    e[11] = depthAxis.z;
    e[15] = ringRadius * 0.999 - depthAxis.dot(ringCenter);
    // The negative-depth arc lies halfway between two of the 48 vertices.
    for (let index = 0; index < 48; index += 1) {
      expect(
        ringRadius * (0.999 + Math.cos((index * TWO_PI) / 48 - angle))
      ).toBeGreaterThan(0);
    }
    expect(
      projectObjectCoverageOutline(
        { ...image, projection },
        referenceSphere,
        center,
        12
      )
    ).toBeNull();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid radius %s",
    (radius) => {
      expect(
        projectObjectCoverageOutline(imageOf(), referenceSphere, center, radius)
      ).toBeNull();
    }
  );

  it("rejects an interior/on-surface camera, a sphere behind the camera and invalid frames", () => {
    const image = imageOf(0, false, true);
    const eye = eyeOf(image);
    expect(
      projectObjectCoverageOutline(image, referenceSphere, eye, 10)
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        image,
        referenceSphere,
        eye.clone().add(new Vector3(10, 0, 0)),
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        image,
        referenceSphere,
        new Vector3(0, 200, 0),
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        image,
        referenceSphere,
        new Vector3(Number.NaN, 0, 0),
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        { ...image, projection: undefined },
        referenceSphere,
        center,
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        { ...image, cameraAltitudeMeters: undefined },
        referenceSphere,
        center,
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        image,
        {
          ...referenceSphere,
          center: { ...referenceSphere.center, longitude: Number.NaN },
        },
        center,
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        { ...image, dataset: { ...image.dataset, cameras: {} } },
        referenceSphere,
        center,
        10
      )
    ).toBeNull();
    expect(
      projectObjectCoverageOutline(
        {
          ...image,
          dataset: {
            ...image.dataset,
            cameras: { camera: { ...calibrationOf(false), widthPx: 0 } },
          },
        },
        referenceSphere,
        center,
        10
      )
    ).toBeNull();
    const projection = image.projection!.clone();
    projection.elements[5] = Number.NaN;
    expect(
      projectObjectCoverageOutline(
        { ...image, projection },
        referenceSphere,
        center,
        10
      )
    ).toBeNull();
  });

  it("does not mutate inputs or reuse stale geometry across calls", () => {
    const image = imageOf(1, true);
    const before = JSON.stringify(image);
    const initial = center.clone();
    const outline = projectObjectCoverageOutline(
      image,
      referenceSphere,
      initial,
      12
    );
    const savedOutline = structuredClone(outline);
    initial.set(9, 18, -6);
    const changed = projectObjectCoverageOutline(
      image,
      referenceSphere,
      initial,
      6
    );
    expect(changed).not.toEqual(outline);
    expect(outline).toEqual(savedOutline);
    expect(initial.toArray()).toEqual([9, 18, -6]);
    expect(JSON.stringify(image)).toBe(before);
    const record = { ...image.record, pose: undefined };
    projectObjectCoverageOutline(
      { ...image, record },
      referenceSphere,
      center,
      12
    );
    expect(record.pose).toBeUndefined();
    expect(referenceSphere).toEqual({
      center: { longitude: 7.2, latitude: 51.27, heightMeters: 10 },
      radiusMeters: 12,
    });
  });
});
