import { describe, expect, it } from "vitest";
import { Matrix4, Sphere, Vector3, Vector4 } from "three";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
  ObliqueSelectionData,
} from "../types";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";
import { imageProjectionMatrix } from "../../runtime/utils/image-projection";
import {
  groupObjectCoverageImages,
  projectObjectCoverageSphere,
} from "./object-coverage";

const pose: ObliquePose = {
  longitude: 7.2,
  latitude: 51.27,
  z: 100,
  bearingDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  direction: [0, 0, -1],
  up: [0, 1, 0],
  utmConvergenceRad: 0,
};
const calibration: ObliqueCameraCalibration = {
  widthPx: 2000,
  heightPx: 1000,
  focalLengthMm: 100,
  principalPointPx: [999.5, 499.5],
  halfFovTan: 1,
  upMapping: { rowIndex: 1, negate: false },
};
const record: ObliqueImageRecord = {
  id: "test-legacy:photo",
  seriesId: "test-legacy",
  sourceId: "photo",
  cameraId: "170",
  x: 0,
  y: 0,
  z: 100,
  centerWGS84: [7.2, 51.27, 100],
  m: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  fallbackHeading: 0,
  sector: 3,
  pose,
};
const matrix = (camera = calibration) =>
  imageProjectionMatrix(record, camera, pose, new Matrix4());

describe("object sphere image coverage", () => {
  it("returns the exact central silhouette crop and native resolution", () => {
    const result = projectObjectCoverageSphere(
      matrix(),
      new Sphere(new Vector3(0, 0, -100), 5),
      calibration
    );
    expect(result?.crop).toEqual({ x: 949, y: 449, width: 102, height: 102 });
    expect(result?.pixelsPerMeter).toBeCloseTo(10);
  });

  it("rejects partial coverage even when the centre and most of the sphere fit", () => {
    expect(
      projectObjectCoverageSphere(
        matrix(),
        new Sphere(new Vector3(85, 0, -100), 20),
        calibration
      )
    ).toBeNull();
    expect(
      projectObjectCoverageSphere(
        matrix(),
        new Sphere(new Vector3(70, 0, -100), 20),
        calibration
      )
    ).not.toBeNull();
  });

  it("accepts sensor tangency and rejects a sphere crossing camera depth", () => {
    expect(
      projectObjectCoverageSphere(
        matrix(),
        new Sphere(new Vector3(100 - 5 * Math.SQRT2, 0, -100), 5),
        calibration
      )
    ).not.toBeNull();
    for (const sphere of [
      new Sphere(new Vector3(0, 0, 100), 5),
      new Sphere(new Vector3(0, 0, -4), 5),
      new Sphere(new Vector3(0, 0, -100), 0),
    ])
      expect(
        projectObjectCoverageSphere(matrix(), sphere, calibration)
      ).toBeNull();
  });

  it("preserves a mounted camera affine and contains its entire off-axis silhouette", () => {
    const camera = {
      ...calibration,
      imageMmToPixelAffine: [
        [0, -10, 850],
        [-20, 0, 600],
      ] as [[number, number, number], [number, number, number]],
    };
    const projection = matrix(camera);
    const sphere = new Sphere(new Vector3(5, 8, -100), 4);
    const result = projectObjectCoverageSphere(projection, sphere, camera)!;
    expect(result).not.toBeNull();
    const { crop } = result;
    const extrema = {
      left: Infinity,
      right: -Infinity,
      top: Infinity,
      bottom: -Infinity,
    };
    // Dense independent surface sampling checks tangent bounds and crop tightness.
    for (let ring = 0; ring <= 80; ring++) {
      const latitude = (ring * Math.PI) / 80;
      for (let segment = 0; segment < 160; segment++) {
        const longitude = (segment * 2 * Math.PI) / 160;
        const point = new Vector4(
          sphere.center.x +
            sphere.radius * Math.sin(latitude) * Math.cos(longitude),
          sphere.center.y +
            sphere.radius * Math.sin(latitude) * Math.sin(longitude),
          sphere.center.z + sphere.radius * Math.cos(latitude),
          1
        ).applyMatrix4(projection);
        const x = (point.x / point.w) * camera.widthPx + 0.5;
        const y = (1 - point.y / point.w) * camera.heightPx + 0.5;
        extrema.left = Math.min(extrema.left, x);
        extrema.right = Math.max(extrema.right, x);
        extrema.top = Math.min(extrema.top, y);
        extrema.bottom = Math.max(extrema.bottom, y);
      }
    }
    expect(extrema.left).toBeGreaterThanOrEqual(crop.x);
    expect(extrema.right).toBeLessThanOrEqual(crop.x + crop.width);
    expect(extrema.top).toBeGreaterThanOrEqual(crop.y);
    expect(extrema.bottom).toBeLessThanOrEqual(crop.y + crop.height);
    expect(extrema.left - crop.x).toBeLessThan(1.1);
    expect(crop.x + crop.width - extrema.right).toBeLessThan(1.1);
    expect(extrema.top - crop.y).toBeLessThan(1.1);
    expect(crop.y + crop.height - extrema.bottom).toBeLessThan(1.1);
    expect(result.pixelsPerMeter).toBeGreaterThan(9);
    expect(result.pixelsPerMeter).toBeLessThan(11);
  });

  it("rejects invalid geometry rather than manufacturing coverage", () => {
    expect(
      projectObjectCoverageSphere(
        matrix(),
        new Sphere(new Vector3(Number.NaN, 0, -100), 5),
        calibration
      )
    ).toBeNull();
    expect(
      projectObjectCoverageSphere(
        new Matrix4().multiplyScalar(0),
        new Sphere(new Vector3(0, 0, -100), 5),
        calibration
      )
    ).toBeNull();
  });

  it("keeps containment, crop and density independent of homogeneous matrix scaling", () => {
    const sphere = new Sphere(new Vector3(3, 2, -100), 5);
    const expected = projectObjectCoverageSphere(
      matrix(),
      sphere,
      calibration
    )!;
    const scaled = projectObjectCoverageSphere(
      matrix().multiplyScalar(300),
      sphere,
      calibration
    )!;
    expect(scaled.crop).toEqual(expected.crop);
    expect(scaled.pixelsPerMeter).toBeCloseTo(expected.pixelsPerMeter);
  });
});

describe("object coverage grouping", () => {
  it("uses calibrated bearing and native resolution, including a farther sharper camera", () => {
    const series = {
      ...TEST_LEGACY_SERIES,
      cameras: {
        "170": calibration,
        high: {
          ...calibration,
          widthPx: 8000,
          heightPx: 4000,
          principalPointPx: [3999.5, 1999.5] as [number, number],
        },
      },
    };
    const sharper = {
      ...record,
      id: "test-legacy:sharper",
      cameraId: "high",
      z: 200,
      pose: { ...pose, z: 200 },
    };
    const east = {
      ...record,
      id: "test-legacy:east",
      pose: { ...pose, bearingDeg: 90 },
    };
    const unresolved = { ...record, id: "test-legacy:unresolved" };
    const data: ObliqueSelectionData = {
      imageRecords: new Map(
        [record, sharper, east, unresolved].map((value) => [value.id, value])
      ),
      datasets: new Map([[series.id, series]]),
      centers: new Map(),
    };
    const groups = groupObjectCoverageImages(
      data,
      {
        center: { longitude: 7.2, latitude: 51.27, heightMeters: 0 },
        radiusMeters: 5,
      },
      new Map([
        [record.id, 100],
        [sharper.id, 200],
        [east.id, 100],
      ])
    );
    expect(groups.get(0)?.map((image) => image.record.id)).toEqual([
      sharper.id,
      record.id,
    ]);
    expect(groups.get(1)?.map((image) => image.record.id)).toEqual([east.id]);
    expect(groups.get(2)).toEqual([]);
    expect(groups.get(3)).toEqual([]);
    const batch = groupObjectCoverageImages(
      data,
      {
        center: { longitude: 7.2, latitude: 51.27, heightMeters: 0 },
        radiusMeters: 5,
      },
      new Map([
        [record.id, 100],
        [sharper.id, 200],
        [east.id, 100],
      ]),
      [sharper]
    );
    expect(batch.get(0)?.map((image) => image.record.id)).toEqual([sharper.id]);
    expect(batch.get(1)).toEqual([]);
  });
});
