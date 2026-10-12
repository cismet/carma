import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import type { Meters } from "@carma-units";
import type {
  CardinalDirection,
  ObliqueCameraCalibration,
  ObliqueImageRecord,
  ObliquePose,
} from "../types";
import { imageProjectionMatrix, sceneToPhotoEnu } from "./image-projection";
import { getOrComputeObliquePose } from "./oblique-pose";
import {
  projectObjectCoveragePoint,
  type ObjectCoverageImage,
  type ObjectCoverageSphere,
} from "./object-coverage";
import { objectCoverageViewPoint } from "./object-coverage-navigation";
import {
  findObjectCoverageNeighbors,
  objectCoverageHeadingLabel,
} from "./object-coverage-neighbors";
import { sceneToPresentationPoint } from "./photo-center-rays";
import { TEST_LEGACY_SERIES } from "./synthetic-series.test-fixture";

const sphere: ObjectCoverageSphere = {
  center: { longitude: 7.2, latitude: 51.27, heightMeters: 10 },
  radiusMeters: 12,
};
const origin: [number, number] = [
  sphere.center.longitude,
  sphere.center.latitude,
];
const calibration: ObliqueCameraCalibration = {
  widthPx: 1000,
  heightPx: 800,
  focalLengthMm: 10,
  principalPointPx: [610.25, 230.75],
  halfFovTan: 1,
  upMapping: { rowIndex: 1, negate: false },
};
const centerMetadata = (
  point: Vector3
): NonNullable<ObliqueImageRecord["catalogCenter"]> => {
  const coordinate = sceneToPresentationPoint(point, origin, new Matrix4());
  return {
    ...coordinate,
    heightMeters: coordinate.heightMeters as Meters,
    ecefMeters: [0, 0, 0],
  };
};
const imageOf = (
  id: string,
  point = new Vector3(0, 10, 0),
  options: {
    roll?: number;
    cameraId?: string;
    principal?: [number, number];
    eyeX?: number;
    bearing?: number;
  } = {}
): ObjectCoverageImage => {
  const cameraId = options.cameraId ?? "BW";
  const camera = {
    ...calibration,
    principalPointPx: options.principal ?? calibration.principalPointPx,
  };
  const eye = sceneToPresentationPoint(
    new Vector3(options.eyeX ?? 0, 100, 0),
    origin,
    new Matrix4()
  );
  const direction = new Vector3(0, 0.6, -0.8),
    up = new Vector3(0, 0.8, 0.6).applyAxisAngle(direction, options.roll ?? 0);
  const pose: ObliquePose = {
    longitude: eye.longitude,
    latitude: eye.latitude,
    z: eye.heightMeters,
    bearingDeg: options.bearing ?? 0,
    pitchDeg: 36.87,
    rollDeg: options.roll ?? 0,
    direction: direction.toArray(),
    up: up.toArray(),
    utmConvergenceRad: 0,
  };
  const record: ObliqueImageRecord = {
    id,
    sourceId: id,
    seriesId: TEST_LEGACY_SERIES.id,
    cameraId,
    x: 0,
    y: 0,
    z: eye.heightMeters,
    centerWGS84: [eye.longitude, eye.latitude, eye.heightMeters],
    m: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    fallbackHeading: 0,
    sector: 0,
    pose,
    catalogCenter: centerMetadata(point),
  };
  const dataset = { ...TEST_LEGACY_SERIES, cameras: { [cameraId]: camera } };
  const projection = imageProjectionMatrix(
    record,
    camera,
    pose,
    sceneToPhotoEnu(origin, new Matrix4(), pose, eye.heightMeters)
  );
  return {
    record,
    dataset,
    projection,
    cameraAltitudeMeters: eye.heightMeters,
    crop: { x: 0, y: 0, width: 1000, height: 800 },
    pixelsPerMeter: 1,
  };
};
const offsetImage = (
  active: ObjectCoverageImage,
  id: string,
  dx: number,
  dy: number,
  height = 10
) => {
  const center = projectObjectCoveragePoint(
    active.projection!,
    new Vector3(0, 10, 0),
    calibration
  )!;
  const point = objectCoverageViewPoint(
    active,
    sphere,
    { x: center.x + dx, y: center.y + dy },
    height
  )!;
  expect(point).not.toBeNull();
  return imageOf(id, point);
};

describe("object coverage neighbors", () => {
  it("chooses nearest physical centers independently of input ordering or pixel resolution", () => {
    const active = imageOf("active");
    const near = offsetImage(active, "near", 20, 0);
    const far = { ...offsetImage(active, "far", 80, 0), pixelsPerMeter: 99999 };
    for (const images of [
      [far, active, near],
      [near, far, active],
    ]) {
      expect(findObjectCoverageNeighbors(active, images, sphere)).toEqual({
        right: near,
      });
    }
  });

  it("measures three-dimensional center distance rather than image-plane distance", () => {
    const active = imageOf("active");
    const nearInPixels = offsetImage(active, "elevated", 10, 0, 80);
    const nearOnGround = offsetImage(active, "ground", 40, 0);
    expect(
      findObjectCoverageNeighbors(active, [nearInPixels, nearOnGround], sphere)
    ).toEqual({ right: nearOnGround });
  });

  it("breaks equal-center distance ties by id, and accepts alternating camera ids in the same series", () => {
    const active = imageOf("active");
    const candidate = offsetImage(active, "b", -25, 0);
    const alternate = {
      ...candidate,
      record: { ...candidate.record, id: "a", cameraId: "FW" },
    };
    const differentSeries = {
      ...offsetImage(active, "foreign", -5, 0),
      record: {
        ...offsetImage(active, "foreign", -5, 0).record,
        seriesId: "another-year",
      },
    };
    for (const images of [
      [candidate, alternate, differentSeries],
      [differentSeries, alternate, candidate],
    ]) {
      expect(findObjectCoverageNeighbors(active, images, sphere)).toEqual({
        left: alternate,
      });
    }
  });

  it("classifies the four major-axis sectors in delivered pixels and omits unavailable arrows", () => {
    const active = imageOf("active");
    const right = offsetImage(active, "right", 30, 20),
      left = offsetImage(active, "left", -30, 20),
      up = offsetImage(active, "up", 20, -30),
      down = offsetImage(active, "down", -20, 30);
    expect(
      findObjectCoverageNeighbors(active, [right, left, up, down], sphere)
    ).toEqual({ right, left, up, down });
    expect(findObjectCoverageNeighbors(active, [up], sphere)).toEqual({ up });
  });

  it("rotates neighbor arrows with the active calibrated image roll and principal offsets", () => {
    const active = imageOf("active"),
      east = imageOf("east", new Vector3(10, 10, 0));
    expect(findObjectCoverageNeighbors(active, [east], sphere)).toEqual({
      right: east,
    });
    const rolled = imageOf("active", undefined, {
      roll: Math.PI / 2,
      principal: [720.125, 175.875],
    });
    expect(findObjectCoverageNeighbors(rolled, [east], sphere)).toEqual({
      up: east,
    });
  });

  it("uses the calibrated principal ray for legacy centers despite displaced sensor midpoints", () => {
    const activeWithCenter = imageOf("active");
    const active = {
      ...activeWithCenter,
      record: { ...activeWithCenter.record, catalogCenter: undefined },
    };
    const sameEye = imageOf("same-eye", undefined, {
      principal: [275.5, 610.25],
    });
    const coincident = {
      ...sameEye,
      record: { ...sameEye.record, catalogCenter: undefined },
    };
    const shifted = imageOf("shifted", undefined, {
      eyeX: 10,
      principal: [275.5, 610.25],
    });
    const legacy = {
      ...shifted,
      record: { ...shifted.record, catalogCenter: undefined },
    };
    expect(
      findObjectCoverageNeighbors(active, [coincident, legacy], sphere)
    ).toEqual({ right: legacy });
  });

  it("skips coincident, behind-camera, invalid and missing centers without adding fallback arrows", () => {
    const active = imageOf("active");
    const coincident = imageOf("same");
    const behind = imageOf("behind", new Vector3(0, 300, 0));
    const incomplete = {
      ...imageOf("incomplete"),
      projection: undefined,
      record: {
        ...imageOf("incomplete").record,
        catalogCenter: undefined,
      },
    };
    const invalid = {
      ...imageOf("invalid"),
      record: {
        ...imageOf("invalid").record,
        catalogCenter: {
          ...active.record.catalogCenter!,
          heightMeters: NaN as Meters,
        },
      },
    };
    expect(
      findObjectCoverageNeighbors(
        active,
        [active, coincident, behind, incomplete, invalid],
        sphere
      )
    ).toEqual({});
    expect(
      findObjectCoverageNeighbors(
        { ...active, projection: undefined },
        [behind],
        sphere
      )
    ).toEqual({});
    expect(
      findObjectCoverageNeighbors(active, [coincident], {
        ...sphere,
        radiusMeters: 0,
      })
    ).toEqual({});
    expect(
      findObjectCoverageNeighbors(
        { ...active, record: { ...active.record, cameraId: "missing" } },
        [behind],
        sphere
      )
    ).toEqual({});
  });
});

describe("object coverage heading label", () => {
  it.each([
    [331, 0, "NNW −29°"],
    [61, 1, "ONO −29°"],
    [151, 2, "SSO −29°"],
    [241, 3, "WSW −29°"],
    [389, 0, "NNO +29°"],
    [-29, 0, "NNW −29°"],
    [720, 0, "N 0°"],
    [359.8, 0, "N 0°"],
    [90, 1, "O 0°"],
  ] as const)(
    "formats actual bearing %s relative to quadrant %s",
    (bearing, quadrant, expected) => {
      expect(
        objectCoverageHeadingLabel(
          imageOf("heading", undefined, { bearing }),
          quadrant
        )
      ).toBe(expected);
    }
  );

  it("derives a missing legacy pose and reports unsupported metadata without a guessed heading", () => {
    const image = imageOf("legacy");
    const legacy = { ...image, record: { ...image.record, pose: undefined } };
    const derived = getOrComputeObliquePose(
      { ...legacy.record },
      legacy.dataset
    );
    expect(objectCoverageHeadingLabel(legacy, 0)).toBe(
      objectCoverageHeadingLabel(
        {
          ...legacy,
          record: { ...legacy.record, pose: derived },
        },
        0
      )
    );
    expect(
      objectCoverageHeadingLabel(
        imageOf("invalid", undefined, { bearing: NaN }),
        0
      )
    ).toBe("—");
    expect(objectCoverageHeadingLabel(image, 4 as CardinalDirection)).toBe("—");
    expect(
      objectCoverageHeadingLabel(
        {
          ...legacy,
          record: { ...legacy.record, pose: undefined, cameraId: "missing" },
        },
        0
      )
    ).toBe("—");
  });
});
