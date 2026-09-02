import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from "three";
import { describe, expect, it } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { ecefToEnuOffset } from "@carma-geo/utils";

import type { ShadowSnapshot } from "./shadow-controller";
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
  const mainCamera = new PerspectiveCamera(50, 2, 0.5, 5_000);
  mainCamera.position.set(100, 200, -50);
  mainCamera.lookAt(new Vector3(10, 20, 30));
  mainCamera.updateMatrixWorld(true);
  mainCamera.updateProjectionMatrix();
  const camera = new OrthographicCamera(-80, 120, 60, -40, 1, 4_000);
  camera.position.set(80, 240, -110);
  camera.lookAt(new Vector3(-15, 40, 0));
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const shadow: ShadowSnapshot = {
    sampleCount: 8,
    totalShadowTexels: 8 * 4_096 ** 2,
    casterReachMeters: 875,
    camera: {
      receiverPointCount: 8,
      receiverLeftMeters: -70,
      receiverRightMeters: 110,
      receiverBottomMeters: -30,
      receiverTopMeters: 50,
      leftMeters: camera.left,
      rightMeters: camera.right,
      bottomMeters: camera.bottom,
      topMeters: camera.top,
      nearMeters: camera.near,
      farMeters: camera.far,
      shadowMapWidth: 4_096,
      shadowMapHeight: 4_096,
      viewMatrixElements: [...camera.matrixWorldInverse.elements],
      projectionMatrixElements: [...camera.projectionMatrix.elements],
      guardMeters: 3,
      metersPerTexel: 0.05,
    },
  };
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
    sceneAnchorPositionElements: [10, 20, 30] as const,
    mainCamera: {
      viewMatrixElements: [...mainCamera.matrixWorldInverse.elements],
      projectionMatrixElements: [...mainCamera.projectionMatrix.elements],
      nearMeters: mainCamera.near,
      farMeters: mainCamera.far,
      viewportWidth: 1_000,
      viewportHeight: 500,
    },
    shadow,
  };
};

describe("buildShadowProjectionDebugModel", () => {
  const instant = new Date("2026-06-21T10:00:00.000Z");

  it("represents the map and fitted shadow cameras as separate frusta", () => {
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      buildSnapshot()
    );

    expect(model?.viewStates).toHaveLength(2);
    expect(model?.viewStates[1].intrinsics.type).toBe(CAMERA_TYPE.ORTHOGRAPHIC);
    expect(model?.receiverCoverageWidthMeters).toBe(180);
    expect(model?.receiverCoverageHeightMeters).toBe(80);
    expect(model?.shadowTexelWidthMeters).toBe(0.05);
    expect(model?.shadowSampleCount).toBe(8);
    expect(model?.casterReachMeters).toBe(875);
    expect(model?.horizontalProjectionPerHeight).toBeCloseTo(Math.sqrt(3), 5);
    expect(model?.viewStates[0].anchorCartographic.altitude).toBeCloseTo(20);
  });

  it("uses the actual shadow-camera pose independently of display angles", () => {
    const snapshot = buildSnapshot();
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 15, elevationDegrees: 8 },
      snapshot
    );
    const changedSolarModel = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 290, elevationDegrees: 65 },
      snapshot
    );
    const viewState = model!.viewStates[1]!;
    const matrixWorld = new Matrix4()
      .fromArray([...snapshot.shadow.camera.viewMatrixElements])
      .invert();
    const expectedOrientation = new Quaternion()
      .setFromRotationMatrix(matrixWorld)
      .normalize();

    expect(viewState.orientation.angleTo(expectedOrientation)).toBeLessThan(
      1e-8
    );
    expect(
      changedSolarModel!.viewStates[1]!.orientation.angleTo(
        viewState.orientation
      )
    ).toBeLessThan(1e-8);

    const offset = ecefToEnuOffset(viewState.cameraPosition, viewState.anchor);
    const expectedPosition = new Vector3()
      .setFromMatrixPosition(matrixWorld)
      .sub(new Vector3(...snapshot.sceneAnchorPositionElements));
    expect(offset.east).toBeCloseTo(expectedPosition.x, 6);
    expect(offset.north).toBeCloseTo(-expectedPosition.z, 6);
    expect(offset.up).toBeCloseTo(expectedPosition.y, 6);
  });

  it("uses the exact render-camera pose in the scene-anchor frame", () => {
    const snapshot = buildSnapshot();
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      snapshot
    );
    const viewState = model!.viewStates[0]!;
    const matrixWorld = new Matrix4()
      .fromArray([...snapshot.mainCamera.viewMatrixElements])
      .invert();
    const expectedPosition = new Vector3()
      .setFromMatrixPosition(matrixWorld)
      .sub(new Vector3(...snapshot.sceneAnchorPositionElements));
    const offset = ecefToEnuOffset(viewState.cameraPosition, viewState.anchor);

    expect(offset.east).toBeCloseTo(expectedPosition.x, 6);
    expect(offset.north).toBeCloseTo(-expectedPosition.z, 6);
    expect(offset.up).toBeCloseTo(expectedPosition.y, 6);
  });

  it("normalizes loaded tile volumes around the scene anchor", () => {
    const snapshot = {
      ...buildSnapshot(),
      tileVolumes: [
        {
          id: "terrain:10/532/218",
          loadReason: "shadow" as const,
          minimum: [0, 10, 20] as const,
          maximum: [20, 30, 40] as const,
        },
      ],
    };
    const model = buildShadowProjectionDebugModel(
      buildMap(),
      { instant, azimuthDegrees: 120, elevationDegrees: 30 },
      snapshot
    );

    expect(model?.tileVolumes).toHaveLength(1);
    const worldScaleMeters = model!.visualizationWorldScaleMeters;
    expect(model?.tileVolumes[0]?.minimum).toEqual([
      expect.closeTo(-10 / worldScaleMeters),
      expect.closeTo(-10 / worldScaleMeters),
      expect.closeTo(-10 / worldScaleMeters),
    ]);
    expect(model?.tileVolumes[0]?.maximum).toEqual([
      expect.closeTo(10 / worldScaleMeters),
      expect.closeTo(10 / worldScaleMeters),
      expect.closeTo(10 / worldScaleMeters),
    ]);
    expect(model?.tileVolumes[0]?.color).toBe("#ea580c");
    expect(model?.viewStates[0].intrinsics.frustum?.far).toBeGreaterThan(0);
  });
});
