import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import type {
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../types";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";
import { imageProjectionMatrix, sceneToPhotoEnu } from "./image-projection";
import {
  projectObjectCoveragePoint,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "./object-coverage";
import {
  createObjectCoverageView,
  objectCoverageViewCrop,
  objectCoverageViewPoint,
  panObjectCoverageView,
  zoomObjectCoverageView,
} from "./object-coverage-navigation";

const sphere: ObjectCoverageSphere = {
  center: { longitude: 7.2, latitude: 51.27, heightMeters: 10 },
  radiusMeters: 12,
};
const calibration: ObliqueCameraCalibration = {
  widthPx: 1600,
  heightPx: 1200,
  focalLengthMm: 10,
  principalPointPx: [812.5, 586.25],
  halfFovTan: 1.5,
  upMapping: { rowIndex: 1, negate: false },
};
const imageOf = (opposite = false, roll = 0): ObjectCoverageImage => {
  const sign = opposite ? -1 : 1;
  const direction = new Vector3(0, sign * 0.6, -0.8);
  const up = new Vector3(0, sign * 0.8, 0.6).applyAxisAngle(direction, roll);
  const pose: ObliquePose = {
    longitude: 7.2,
    latitude: 51.27,
    z: 100,
    bearingDeg: opposite ? 180 : 0,
    pitchDeg: 53.13,
    rollDeg: 0,
    direction: direction.toArray(),
    up: up.toArray(),
    utmConvergenceRad: 0,
  };
  const record: ObliqueImageRecord = {
    id: opposite ? "opposite" : "forward",
    seriesId: TEST_LEGACY_SERIES.id,
    sourceId: "synthetic",
    cameraId: "camera",
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
    sector: opposite ? 2 : 0,
    pose,
  };
  const dataset = { ...TEST_LEGACY_SERIES, cameras: { camera: calibration } };
  const projection = imageProjectionMatrix(
    record,
    calibration,
    pose,
    sceneToPhotoEnu(
      [sphere.center.longitude, sphere.center.latitude],
      new Matrix4(),
      pose,
      100
    )
  );
  const point = projectObjectCoveragePoint(
    projection,
    new Vector3(0, 10, 0),
    calibration
  )!;
  return {
    record,
    dataset,
    projection,
    cameraAltitudeMeters: 100,
    pixelsPerMeter: 6,
    crop: { x: point.x - 100, y: point.y - 80, width: 200, height: 160 },
  };
};
const pixelOf = (image: ObjectCoverageImage, point: Vector3) =>
  projectObjectCoveragePoint(image.projection!, point, calibration)!;
const expectPoint = (actual: Vector3 | null, expected: Vector3) => {
  expect(actual).not.toBeNull();
  expect(actual!.distanceTo(expected)).toBeLessThan(1e-7);
};

describe("object coverage view navigation", () => {
  it("starts at the selected object's metric height and preserves the default crop", () => {
    const image = imageOf();
    const view = createObjectCoverageView(sphere);
    expect(view.focus.toArray()).toEqual([0, 10, 0]);
    expect(view.zoom).toBe(1);
    expect(objectCoverageViewCrop(image, sphere, image.crop, view)).toEqual(
      image.crop
    );
    expect(() =>
      createObjectCoverageView({ ...sphere, radiusMeters: 0 })
    ).toThrow(RangeError);
  });

  it.each([false, true])(
    "round-trips calibrated pixels on the focus plane, including rolled opposite views (%s)",
    (opposite) => {
      const image = imageOf(opposite, 0.41);
      const focus = new Vector3(3, 10, -2);
      expect(image.projection!.determinant()).toBeCloseTo(0, 12);
      expectPoint(
        objectCoverageViewPoint(image, sphere, pixelOf(image, focus), 10),
        focus
      );
      expectPoint(
        objectCoverageViewPoint(
          image,
          sphere,
          pixelOf(image, new Vector3(1, 15, 2)),
          15
        ),
        new Vector3(1, 15, 2)
      );
    }
  );

  it("pans a shared physical focus that projects differently in the opposite heading", () => {
    const forward = imageOf(),
      opposite = imageOf(true);
    const initial = createObjectCoverageView(sphere);
    const from = pixelOf(forward, initial.focus);
    const destination = pixelOf(forward, new Vector3(-3, 10, 2));
    const view = panObjectCoverageView(
      forward,
      sphere,
      forward.crop,
      initial,
      from,
      { x: 2 * from.x - destination.x, y: 2 * from.y - destination.y }
    )!;
    expectPoint(view.focus, new Vector3(-3, 10, 2));
    expect(view.zoom).toBe(1);
    for (const image of [forward, opposite]) {
      const crop = objectCoverageViewCrop(image, sphere, image.crop, view)!;
      const originalPixel = pixelOf(image, initial.focus),
        focusPixel = pixelOf(image, view.focus);
      expect(
        crop.x + crop.width / 2 - (image.crop.x + image.crop.width / 2)
      ).toBeCloseTo(focusPixel.x - originalPixel.x, 9);
      expect(
        crop.y + crop.height / 2 - (image.crop.y + image.crop.height / 2)
      ).toBeCloseTo(focusPixel.y - originalPixel.y, 9);
      expectPoint(
        objectCoverageViewPoint(image, sphere, focusPixel, 10),
        view.focus
      );
    }
    expect(
      objectCoverageViewCrop(forward, sphere, forward.crop, view)!.x
    ).toBeLessThan(forward.crop.x);
    expect(
      objectCoverageViewCrop(opposite, sphere, opposite.crop, view)!.x
    ).toBeGreaterThan(opposite.crop.x);
    expect(initial.focus.toArray()).toEqual([0, 10, 0]);
  });

  it("translates the crop by the exact native pixel delta at a noncentral perspective focus", () => {
    const image = imageOf(false, 0.41);
    const view = { focus: new Vector3(3, 10, -4), zoom: 2 };
    const crop = objectCoverageViewCrop(image, sphere, image.crop, view)!;
    const from = {
      x: crop.x + crop.width * 0.2,
      y: crop.y + crop.height * 0.8,
    };
    const to = { x: from.x + 5, y: from.y + 7 };
    const next = panObjectCoverageView(image, sphere, crop, view, from, to)!;
    const moved = objectCoverageViewCrop(image, sphere, image.crop, next)!;
    expect(next.focus.distanceTo(new Vector3(0, 10, 0))).toBeLessThan(
      sphere.radiusMeters
    );
    expect(moved.x + moved.width / 2 - (crop.x + crop.width / 2)).toBeCloseTo(
      from.x - to.x,
      9
    );
    expect(moved.y + moved.height / 2 - (crop.y + crop.height / 2)).toBeCloseTo(
      from.y - to.y,
      9
    );
    expect(moved.width).toBe(crop.width);
    expect(moved.height).toBe(crop.height);
    const restored = panObjectCoverageView(
      image,
      sphere,
      moved,
      next,
      to,
      from
    )!;
    expectPoint(restored.focus, view.focus);
    expect(view.focus.toArray()).toEqual([3, 10, -4]);
  });

  it("keeps an off-center native pixel at the same viewport fraction when zooming and reversing", () => {
    const image = imageOf(false, 0.25);
    const initial = createObjectCoverageView(sphere),
      crop = image.crop;
    const pixel = {
      x: crop.x + crop.width * 0.7,
      y: crop.y + crop.height * 0.3,
    };
    const view = zoomObjectCoverageView(
      image,
      sphere,
      crop,
      initial,
      pixel,
      2
    )!;
    expect(view.zoom).toBe(2);
    const zoomed = objectCoverageViewCrop(image, sphere, crop, view)!;
    expect(zoomed.width).toBe(100);
    expect(zoomed.height).toBe(80);
    expect((pixel.x - zoomed.x) / zoomed.width).toBeCloseTo(0.7, 9);
    expect((pixel.y - zoomed.y) / zoomed.height).toBeCloseTo(0.3, 9);
    const restored = zoomObjectCoverageView(
      image,
      sphere,
      zoomed,
      view,
      pixel,
      0.5
    )!;
    expect(restored.zoom).toBe(1);
    expectPoint(restored.focus, initial.focus);
  });

  it("clamps panning to the original sphere at the current focus height", () => {
    const image = imageOf();
    const view = { focus: new Vector3(0, 18, 0), zoom: 1 };
    const next = panObjectCoverageView(
      image,
      sphere,
      image.crop,
      view,
      pixelOf(image, view.focus),
      pixelOf(image, new Vector3(100, 18, 0))
    )!;
    expect(next.focus.y).toBe(18);
    expect(next.focus.x).toBeCloseTo(-Math.sqrt(12 * 12 - 8 * 8), 7);
    expect(next.focus.distanceTo(new Vector3(0, 10, 0))).toBeCloseTo(12, 7);
    expect(view.focus.toArray()).toEqual([0, 18, 0]);
  });

  it("bounds zoom to 1..16 and coalesces unchanged valid actions", () => {
    const image = imageOf(),
      view = createObjectCoverageView(sphere),
      pixel = pixelOf(image, view.focus);
    expect(
      panObjectCoverageView(image, sphere, image.crop, view, pixel, pixel)
    ).toBe(view);
    expect(
      zoomObjectCoverageView(image, sphere, image.crop, view, pixel, 0.5)
    ).toBe(view);
    expect(
      zoomObjectCoverageView(image, sphere, image.crop, view, pixel, 1)
    ).toBe(view);
    const next = zoomObjectCoverageView(
      image,
      sphere,
      image.crop,
      view,
      pixel,
      100
    )!;
    expect(next.zoom).toBe(16);
    expectPoint(next.focus, view.focus);
    const crop = objectCoverageViewCrop(image, sphere, image.crop, next)!;
    expect(zoomObjectCoverageView(image, sphere, crop, next, pixel, 2)).toBe(
      next
    );
  });

  it("never fabricates a plane hit for absent calibration, invalid values, or a plane behind the camera", () => {
    const image = imageOf(),
      view = createObjectCoverageView(sphere),
      pixel = pixelOf(image, view.focus);
    expect(
      objectCoverageViewPoint(
        { ...image, projection: undefined },
        sphere,
        pixel,
        10
      )
    ).toBeNull();
    expect(
      objectCoverageViewPoint(
        { ...image, cameraAltitudeMeters: undefined },
        sphere,
        pixel,
        10
      )
    ).toBeNull();
    expect(objectCoverageViewPoint(image, sphere, pixel, 200)).toBeNull();
    expect(
      objectCoverageViewPoint(image, sphere, { x: NaN, y: 0 }, 10)
    ).toBeNull();
    expect(
      objectCoverageViewCrop(image, sphere, { ...image.crop, width: 0 }, view)
    ).toBeNull();
    expect(
      objectCoverageViewCrop(
        { ...image, projection: undefined },
        sphere,
        image.crop,
        view
      )
    ).toBeNull();
    expect(
      panObjectCoverageView(
        { ...image, projection: undefined },
        sphere,
        image.crop,
        view,
        pixel,
        { x: pixel.x + 10, y: pixel.y }
      )
    ).toBeNull();
    expect(
      zoomObjectCoverageView(image, sphere, image.crop, view, pixel, NaN)
    ).toBeNull();
    expect(
      zoomObjectCoverageView(image, sphere, image.crop, view, pixel, 0)
    ).toBeNull();
  });

  it("rejects a calibrated ray parallel to the focus plane", () => {
    const image = imageOf();
    const pose = {
      ...image.record.pose!,
      direction: [0, 1, 0] as [number, number, number],
      up: [0, 0, 1] as [number, number, number],
    };
    const record = { ...image.record, pose };
    const projection = imageProjectionMatrix(
      record,
      calibration,
      pose,
      sceneToPhotoEnu(
        [sphere.center.longitude, sphere.center.latitude],
        new Matrix4(),
        pose,
        100
      )
    );
    expect(
      objectCoverageViewPoint(
        { ...image, record, projection },
        sphere,
        {
          x: calibration.principalPointPx[0] + 0.5,
          y: calibration.principalPointPx[1] + 0.5,
        },
        10
      )
    ).toBeNull();
  });
});
