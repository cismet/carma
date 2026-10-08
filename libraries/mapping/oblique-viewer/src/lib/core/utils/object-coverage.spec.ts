import { describe, expect, it } from "vitest";
import { Matrix4, Sphere, Vector3, Vector4 } from "three";
import type { CssPixels, DevicePixels, Ratio } from "@carma-units";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
  ObliqueSelectionData,
} from "../types";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";
import { imageProjectionMatrix } from "./image-projection";
import {
  fitObjectCoverageCrop,
  groupObjectCoverageImages,
  objectCoveragePixelRay,
  projectObjectCoveragePoint,
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

describe("object-view panel geometry", () => {
  const viewport = (width: number, height: number) => ({
    width: width as CssPixels,
    height: height as CssPixels,
  });
  const crop = { x: 290, y: 390, width: 20, height: 20 };

  it.each([1, 0.5, 0.125])(
    "caps display magnification against source density%s while retaining native sensor coordinates",
    (density) => {
      const result = fitObjectCoverageCrop(
        crop,
        viewport(600, 300),
        2 as Ratio,
        density as Ratio
      );
      expect(result.width / result.height).toBe(2);
      expect(result.x + result.width / 2).toBe(300);
      expect(result.y + result.height / 2).toBe(400);
      expect((600 * 2) / (result.width * density)).toBeCloseTo(3, 12);
      expect((300 * 2) / (result.height * density)).toBeCloseTo(3, 12);
      expect(result.x).toBeLessThanOrEqual(crop.x);
      expect(result.y).toBeLessThanOrEqual(crop.y);
      expect(result.x + result.width).toBeGreaterThanOrEqual(
        crop.x + crop.width
      );
      expect(result.y + result.height).toBeGreaterThanOrEqual(
        crop.y + crop.height
      );
    }
  );

  it("keeps full-source legacy defaults and expands a tight publicL1 crop twice as far", () => {
    const legacy = fitObjectCoverageCrop(crop, viewport(600, 300), 2 as Ratio);
    const publicL1 = fitObjectCoverageCrop(
      crop,
      viewport(600, 300),
      2 as Ratio,
      0.5 as Ratio
    );
    expect(legacy).toEqual({ x: 100, y: 300, width: 400, height: 200 });
    expect(publicL1).toEqual({ x: -100, y: 200, width: 800, height: 400 });
  });

  it("preserves a large silhouette and panel aspect without fabricating sensor clipping", () => {
    const result = fitObjectCoverageCrop(
      { x: 0, y: 0, width: 600, height: 100 },
      viewport(300, 600),
      1 as Ratio,
      0.5 as Ratio
    );
    expect(result).toEqual({ x: 0, y: -550, width: 600, height: 1200 });
    expect(result.width / result.height).toBe(0.5);
    expect(() =>
      fitObjectCoverageCrop(crop, viewport(0, 300), 1 as Ratio)
    ).toThrow(RangeError);
  });
});

describe("calibrated object-view measurement geometry", () => {
  const pixel = (x: number, y: number) => ({
    x: x as DevicePixels,
    y: y as DevicePixels,
  });

  it("uses delivered pixel centres and projects a native pixel ray back to exactly that pixel", () => {
    const projection = matrix();
    const centerRay = objectCoveragePixelRay(
      projection,
      new Vector3(),
      pixel(1000, 500),
      calibration
    )!;
    expect(centerRay.direction.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(
      1e-12
    );
    const target = pixel(1600, 700);
    const ray = objectCoveragePixelRay(
      projection,
      new Vector3(),
      target,
      calibration
    )!;
    const point = ray.at(125, new Vector3());
    const projected = projectObjectCoveragePoint(
      projection,
      point,
      calibration
    )!;
    expect(projected.x).toBeCloseTo(target.x, 10);
    expect(projected.y).toBeCloseTo(target.y, 10);
  });

  it("uses the mounted delivered affine rather than guessing axis flips from camera labels", () => {
    const mounted = {
      ...calibration,
      imageMmToPixelAffine: [
        [0, -10, 850],
        [-20, 0, 600],
      ] as [[number, number, number], [number, number, number]],
    };
    const projection = matrix(mounted);
    const target = pixel(730, 540);
    const ray = objectCoveragePixelRay(
      projection,
      new Vector3(),
      target,
      mounted
    )!;
    const projected = projectObjectCoveragePoint(
      projection,
      ray.at(80, new Vector3()),
      mounted
    )!;
    expect(projected.x).toBeCloseTo(target.x, 10);
    expect(projected.y).toBeCloseTo(target.y, 10);
  });

  it("reconstructs the same physical ground point from north and east camera pixels", () => {
    const groundPoint = new Vector3(3, 4, 0);
    const views = [
      { eye: new Vector3(0, -100, 100), direction: [0, 1, -1], up: [0, 1, 1] },
      { eye: new Vector3(-100, 0, 100), direction: [1, 0, -1], up: [1, 0, 1] },
    ];
    const nativePixels = [];
    for (const view of views) {
      const cameraPose = {
        ...pose,
        direction: view.direction,
        up: view.up,
      } as ObliquePose;
      const projection = imageProjectionMatrix(
        record,
        calibration,
        cameraPose,
        new Matrix4().makeTranslation(-view.eye.x, -view.eye.y, -view.eye.z)
      );
      const nativePixel = projectObjectCoveragePoint(
        projection,
        groundPoint,
        calibration
      )!;
      nativePixels.push(nativePixel);
      const ray = objectCoveragePixelRay(
        projection,
        view.eye,
        nativePixel,
        calibration
      )!;
      const reconstructed = ray.at(
        -ray.origin.z / ray.direction.z,
        new Vector3()
      );
      expect(reconstructed.distanceTo(groundPoint)).toBeLessThan(1e-10);
      expect(ray.origin.toArray()).toEqual(view.eye.toArray());
      view.eye.set(0, 0, 0);
      expect(ray.origin.length()).toBeGreaterThan(100); // Returned ray owns its physical origin.
    }
    expect(nativePixels[0]).not.toEqual(nativePixels[1]);
  });

  it("rejects behind-camera points and degenerate rays instead of inventing measurements", () => {
    expect(
      projectObjectCoveragePoint(matrix(), new Vector3(0, 0, 100), calibration)
    ).toBeNull();
    expect(
      objectCoveragePixelRay(
        new Matrix4().multiplyScalar(0),
        new Vector3(),
        pixel(1000, 500),
        calibration
      )
    ).toBeNull();
    expect(
      objectCoveragePixelRay(
        matrix(),
        new Vector3(),
        pixel(Number.NaN, 500),
        calibration
      )
    ).toBeNull();
  });
});

describe("object coverage grouping", () => {
  it("excludes a fully covering nadir photograph from the four cardinal object-view groups", () => {
    const nadirCalibration = { ...calibration, view: "nadir" as const };
    // The delivered nadir photo has the same valid frustum as this covering fixture.
    expect(
      projectObjectCoverageSphere(
        matrix(nadirCalibration),
        new Sphere(new Vector3(0, 0, -100), 5),
        nadirCalibration
      )
    ).not.toBeNull();
    const nadir = {
      ...record,
      id: "test-legacy:nadir",
      sourceId: "nadir",
      cameraId: "nadir",
    };
    const series = {
      ...TEST_LEGACY_SERIES,
      cameras: { "170": calibration, nadir: nadirCalibration },
    };
    const data: ObliqueSelectionData = {
      imageRecords: new Map([record, nadir].map((photo) => [photo.id, photo])),
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
        [nadir.id, 100],
      ])
    );
    expect(groups.get(0)?.map((image) => image.record.id)).toEqual([record.id]);
    expect(
      [...groups.values()].flat().map((image) => image.record.id)
    ).not.toContain(nadir.id);
  });

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
    for (const image of groups.get(0)!) {
      expect(image.projection).toBeInstanceOf(Matrix4);
      expect(image.cameraAltitudeMeters).toBe(
        image.record.id === sharper.id ? 200 : 100
      );
      // One shared point in the object-anchored east/up/south metre frame.
      const point = new Vector4(10, 5, 0, 1).applyMatrix4(image.projection!);
      const camera =
        image.record.id === sharper.id ? series.cameras.high : calibration;
      const height = image.cameraAltitudeMeters! - 5;
      expect(point.x / point.w).toBeCloseTo(
        camera.principalPointPx[0] / camera.widthPx + 10 / (2 * height),
        9
      );
      expect(point.y / point.w).toBeCloseTo(
        1 - camera.principalPointPx[1] / camera.heightPx,
        9
      );
      expect(point.w).toBeCloseTo(height, 7);
    }
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
