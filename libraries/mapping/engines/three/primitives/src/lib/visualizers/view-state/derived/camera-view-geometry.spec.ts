import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  buildOrthographicScale,
  CAMERA_TYPE,
} from "@carma-commons/camera/model";
import { buildViewState } from "@carma-mapping/engines-interop/view-state";
import type { ViewState } from "@carma-mapping/engines-interop/view-state";
import { degToRadNumeric } from "@carma/units/helpers";

import { buildImagePlaneGeometry } from "./camera-view-geometry";
const WORLD_UP = new Vector3(0, 1, 0);
const SPEC_LONGITUDE_RAD = degToRadNumeric(7.2);
const SPEC_LATITUDE_RAD = degToRadNumeric(51.27);
const SPEC_ALTITUDE_M = 247;
const SPEC_HEMISPHERE_RADIUS = 1;
const SPEC_EPSILON = 1e-6;
const SPEC_GEOMETRY_DEFAULTS = {
  distance: 0.33,
  basisLineLength: 0.1,
  originHalfExtent: 0.04,
  fallbackHalfHeight: 0.1,
  fallbackHalfWidth: 0.1,
  maxDistance: 2,
} as const;

const polygonAreaXZ = (polygon: { x: number; z: number }[]): number => {
  if (polygon.length < 3) {
    return 0;
  }

  let areaTwice = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    areaTwice += current.x * next.z - next.x * current.z;
  }

  return Math.abs(areaTwice) * 0.5;
};

const rotateAroundUp = (point: Vector3, angleRad: number): Vector3 =>
  point.clone().applyAxisAngle(WORLD_UP, angleRad);

const expectVectorClose = (actual: Vector3, expected: Vector3) => {
  expect(actual.distanceTo(expected)).toBeLessThan(1e-8);
};

const buildOptionalFrustum = ({
  nearM,
  farM,
}: {
  nearM?: number;
  farM?: number;
}) =>
  (nearM ?? 0) > 0 || (farM ?? 0) > 0
    ? {
        frustum: {
          ...((nearM ?? 0) > 0 ? { near: nearM } : {}),
          ...((farM ?? 0) > 0 ? { far: farM } : {}),
        },
      }
    : {};

const buildPerspectiveViewState = ({
  bearingDeg,
  pitchDeg,
  rangeM = 500,
  nearM,
  farM,
}: {
  bearingDeg: number;
  pitchDeg: number;
  rangeM?: number;
  nearM?: number;
  farM?: number;
}): ViewState =>
  buildViewState({
    longitude: SPEC_LONGITUDE_RAD,
    latitude: SPEC_LATITUDE_RAD,
    altitude: SPEC_ALTITUDE_M,
    bearing: degToRadNumeric(bearingDeg),
    pitch: degToRadNumeric(pitchDeg),
    range: rangeM,
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: degToRadNumeric(41.5),
      fovHorizontal: degToRadNumeric(44.8),
      ...buildOptionalFrustum({ nearM, farM }),
    },
    metadata: {
      frameId: 1,
      timestampMs: 0,
      sourceId: "spec",
      source: "user-interaction",
    },
  });

const buildOrthographicViewState = ({
  bearingDeg,
  pitchDeg,
  rangeM = 500,
  nearM,
  farM,
  orthographicMetersPerCssPixel,
  viewportWidthPx,
  viewportHeightPx,
}: {
  bearingDeg: number;
  pitchDeg: number;
  rangeM?: number;
  nearM?: number;
  farM?: number;
  orthographicMetersPerCssPixel?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
}): ViewState =>
  buildViewState({
    longitude: SPEC_LONGITUDE_RAD,
    latitude: SPEC_LATITUDE_RAD,
    altitude: SPEC_ALTITUDE_M,
    bearing: degToRadNumeric(bearingDeg),
    pitch: degToRadNumeric(pitchDeg),
    range: rangeM,
    intrinsics: {
      type: CAMERA_TYPE.ORTHOGRAPHIC,
      ...(typeof orthographicMetersPerCssPixel === "number"
        ? {
            orthographicScale: buildOrthographicScale(
              orthographicMetersPerCssPixel
            ),
          }
        : {}),
      ...buildOptionalFrustum({ nearM, farM }),
    },
    metadata: {
      frameId: 1,
      timestampMs: 0,
      sourceId: "spec",
      source: "user-interaction",
      ...(typeof viewportWidthPx === "number" &&
      typeof viewportHeightPx === "number"
        ? {
            viewport: {
              widthPx: viewportWidthPx,
              heightPx: viewportHeightPx,
            },
          }
        : {}),
    },
  });

const buildGeometry = (viewState: ViewState) =>
  buildImagePlaneGeometry({
    viewState,
    visualized: {
      maxPitch: null,
      imagePlaneDistance: null,
    },
    hemisphereRadius: SPEC_HEMISPHERE_RADIUS,
    imagePlaneDefaults: SPEC_GEOMETRY_DEFAULTS,
    epsilon: SPEC_EPSILON,
  });

const buildProjectionPolygon = (viewState: ViewState) =>
  buildGeometry(viewState).projectionPlanePolygon;

describe("camera-view-geometry ground projection", () => {
  it("derives the visible camera form in a local bearing-zero frame before rotating it back out", () => {
    const baseGeometry = buildGeometry(
      buildPerspectiveViewState({
        bearingDeg: 0,
        pitchDeg: 63,
      })
    );
    const bearingRad = degToRadNumeric(62);
    const rotatedGeometry = buildGeometry(
      buildPerspectiveViewState({
        bearingDeg: 62,
        pitchDeg: 63,
      })
    );

    expectVectorClose(
      rotateAroundUp(rotatedGeometry.cameraPosition, -bearingRad),
      baseGeometry.cameraPosition
    );
    expectVectorClose(
      rotateAroundUp(rotatedGeometry.forward, -bearingRad),
      baseGeometry.forward
    );
    expectVectorClose(
      rotateAroundUp(rotatedGeometry.right, -bearingRad),
      baseGeometry.right
    );
    expectVectorClose(
      rotateAroundUp(rotatedGeometry.up, -bearingRad),
      baseGeometry.up
    );

    baseGeometry.imagePlaneCorners.forEach((corner, index) => {
      expectVectorClose(
        rotateAroundUp(rotatedGeometry.imagePlaneCorners[index]!, -bearingRad),
        corner
      );
    });
  });

  it("keeps a visible perspective ground footprint for near-horizon pitch across nearby bearings", () => {
    const geometry171 = buildGeometry(
      buildPerspectiveViewState({
        bearingDeg: 171,
        pitchDeg: 80,
      })
    );
    const polygon171 = geometry171.projectionPlanePolygon;
    const polygon173 = buildProjectionPolygon(
      buildPerspectiveViewState({
        bearingDeg: 173,
        pitchDeg: 79,
      })
    );

    expect(polygon171).not.toBeNull();
    expect(polygon173).not.toBeNull();
    expect(polygon171!.length).toBeGreaterThanOrEqual(3);
    expect(polygon173!.length).toBeGreaterThanOrEqual(3);
    expect(polygonAreaXZ(polygon171!)).toBeGreaterThan(1e-6);
    expect(polygonAreaXZ(polygon173!)).toBeGreaterThan(1e-6);
  });

  it("extends perspective frustum corner rays beyond the image plane toward ground or sphere intersections", () => {
    const geometry = buildGeometry(
      buildPerspectiveViewState({
        bearingDeg: 204,
        pitchDeg: 63,
      })
    );

    geometry.imagePlaneCorners.forEach((corner, index) => {
      const edge = geometry.frustumEdges[index];

      expect(edge).not.toBeNull();

      const imagePlaneDistance = corner.distanceTo(geometry.cameraPosition);
      const frustumDistance = edge![1]!.distanceTo(geometry.cameraPosition);
      const cornerDirection = corner
        .clone()
        .sub(geometry.cameraPosition)
        .normalize();
      const frustumDirection = edge![1]!
        .clone()
        .sub(geometry.cameraPosition)
        .normalize();

      expect(frustumDistance).toBeGreaterThan(imagePlaneDistance + 1e-6);
      expect(frustumDirection.distanceTo(cornerDirection)).toBeLessThan(1e-8);
    });
  });

  it("keeps an orthographic ground footprint for high-pitch oblique bearings", () => {
    const polygon = buildProjectionPolygon(
      buildOrthographicViewState({
        bearingDeg: 202,
        pitchDeg: 76,
      })
    );

    expect(polygon).not.toBeNull();
    expect(polygon!.length).toBeGreaterThanOrEqual(3);
    expect(polygonAreaXZ(polygon!)).toBeGreaterThan(1e-6);
  });

  it("derives orthographic tangent-plane extents from orthographicScale and viewport", () => {
    const geometry = buildGeometry(
      buildOrthographicViewState({
        bearingDeg: 0,
        pitchDeg: 0,
        rangeM: 500,
        orthographicMetersPerCssPixel: 1,
        viewportWidthPx: 400,
        viewportHeightPx: 200,
      })
    );

    expect(geometry.orthographicTangentPlaneCorners).not.toBeNull();

    const tangentPlaneCorners = geometry.orthographicTangentPlaneCorners!;
    const tangentPlaneWidth = tangentPlaneCorners[0]!.distanceTo(
      tangentPlaneCorners[1]!
    );
    const tangentPlaneHeight = tangentPlaneCorners[1]!.distanceTo(
      tangentPlaneCorners[2]!
    );

    expect(tangentPlaneWidth).toBeCloseTo(0.8, 8);
    expect(tangentPlaneHeight).toBeCloseTo(0.4, 8);
  });

  it("normalizes orthographic near and far distances from meters into hemisphere units", () => {
    const polygonShortRange = buildProjectionPolygon(
      buildOrthographicViewState({
        bearingDeg: 202,
        pitchDeg: 76,
        rangeM: 500,
        nearM: 50,
        farM: 250,
      })
    );
    const polygonLongRange = buildProjectionPolygon(
      buildOrthographicViewState({
        bearingDeg: 202,
        pitchDeg: 76,
        rangeM: 1000,
        nearM: 100,
        farM: 500,
      })
    );

    expect(polygonShortRange).not.toBeNull();
    expect(polygonLongRange).not.toBeNull();
    expect(polygonShortRange).toHaveLength(polygonLongRange!.length);

    polygonShortRange!.forEach((point, index) => {
      expect(point.distanceTo(polygonLongRange![index]!)).toBeLessThan(1e-6);
    });
  });

  it("normalizes perspective near and far distances from meters into hemisphere units", () => {
    const polygonShortRange = buildProjectionPolygon(
      buildPerspectiveViewState({
        bearingDeg: 204,
        pitchDeg: 63,
        rangeM: 500,
        nearM: 50,
        farM: 250,
      })
    );
    const polygonLongRange = buildProjectionPolygon(
      buildPerspectiveViewState({
        bearingDeg: 204,
        pitchDeg: 63,
        rangeM: 1000,
        nearM: 100,
        farM: 500,
      })
    );

    expect(polygonShortRange).not.toBeNull();
    expect(polygonLongRange).not.toBeNull();
    expect(polygonShortRange).toHaveLength(polygonLongRange!.length);

    polygonShortRange!.forEach((point, index) => {
      expect(point.distanceTo(polygonLongRange![index]!)).toBeLessThan(1e-6);
    });
  });
});
