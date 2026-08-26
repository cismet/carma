import type { Map as MaplibreMap } from "maplibre-gl";
import { OrthographicCamera } from "three";
import { describe, expect, it } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";

import { buildShadowProjectionDebugModel } from "./shadow-projection-debug-model";

const buildMap = () =>
  ({
    getBearing: () => 0,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    getCanvas: () => ({
      clientWidth: 1_000,
      clientHeight: 500,
      width: 1_000,
      height: 500,
    }),
    getPitch: () => 45,
    getZoom: () => 16,
    unproject: ([x, y]: [number, number]) => ({
      lng: 7.15 + (x - 500) * 0.00001,
      lat: 51.25 - (y - 250) * 0.00001,
    }),
  } as unknown as MaplibreMap);

const buildSnapshot = () => {
  const camera = new OrthographicCamera(-80, 120, 60, -40, 1, 4_000);
  camera.updateProjectionMatrix();
  return {
    cameraRangeMeters: 2_500,
    leftMeters: camera.left,
    rightMeters: camera.right,
    bottomMeters: camera.bottom,
    topMeters: camera.top,
    nearMeters: camera.near,
    farMeters: camera.far,
    projectionMatrixElements: [...camera.projectionMatrix.elements],
    shadowMapWidth: 4_096,
    shadowMapHeight: 4_096,
    minimumElevationMeters: 120,
    maximumElevationMeters: 320,
  } as const;
};

describe("buildShadowProjectionDebugModel", () => {
  it("represents the map camera and directional sun as separate frusta", () => {
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { azimuthDegrees: 120, elevationDegrees: 30 },
      buildSnapshot()
    );

    expect(model).not.toBeNull();
    expect(model?.viewStates).toHaveLength(2);
    expect(model?.viewStates[1].intrinsics.type).toBe(CAMERA_TYPE.ORTHOGRAPHIC);
    expect(model?.viewportWidthMeters).toBeGreaterThan(0);
    expect(model?.viewportHeightMeters).toBeGreaterThan(0);
    expect(model?.shadowWidthMeters).toBe(200);
    expect(model?.shadowHeightMeters).toBe(100);
    expect(model?.shadowTexelWidthMeters).toBeCloseTo(200 / 4_096, 8);
    expect(model?.shadowTexelHeightMeters).toBeCloseTo(100 / 4_096, 8);
    expect(model?.elevationSpanMeters).toBe(200);
    expect(model?.horizontalProjectionPerHeight).toBeCloseTo(Math.sqrt(3), 5);
  });

  it("shows the rapidly growing caster reach near the horizon", () => {
    const map = buildMap();
    const highSun = buildShadowProjectionDebugModel(
      map,
      { azimuthDegrees: 180, elevationDegrees: 60 },
      buildSnapshot()
    );
    const lowSun = buildShadowProjectionDebugModel(
      map,
      { azimuthDegrees: 180, elevationDegrees: 5 },
      buildSnapshot()
    );

    expect(lowSun?.horizontalProjectionPerHeight).toBeGreaterThan(
      highSun?.horizontalProjectionPerHeight ?? Number.POSITIVE_INFINITY
    );
  });
});
