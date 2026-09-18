import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { synthesizeLodCamera } from "./lodCamera";

const LONGITUDE = 7.15;
const LATITUDE = 51.26;
const VIEWPORT_HEIGHT = 900;
const WORLD_SIZE = 512 * 2 ** 17;

const buildMap = ({
  publicFovDegrees,
  privateFovRadians,
  cameraToCenterDistance,
  centerElevationMeters,
  centerOffset,
  width,
  height,
}: {
  publicFovDegrees?: number;
  privateFovRadians?: number;
  cameraToCenterDistance: number;
  centerElevationMeters?: number;
  centerOffset?: { x: number; y: number };
  width?: number;
  height?: number;
}) =>
  ({
    transform: {
      _fov: privateFovRadians,
      cameraToCenterDistance,
      worldSize: WORLD_SIZE,
      centerOffset,
      width,
      height,
    },
    ...(publicFovDegrees === undefined
      ? {}
      : { getVerticalFieldOfView: () => publicFovDegrees }),
    getCenter: () => ({ lng: LONGITUDE, lat: LATITUDE }),
    ...(centerElevationMeters === undefined
      ? {}
      : { getCenterElevation: () => centerElevationMeters }),
    getPitch: () => 0,
    getBearing: () => 0,
    queryTerrainElevation: () => 0,
  } as unknown as MaplibreMap);

const buildFrame = () => {
  const originMerc = MercatorCoordinate.fromLngLat([LONGITUDE, LATITUDE], 0);
  return {
    originMerc,
    meterScale: originMerc.meterInMercatorCoordinateUnits(),
    viewport: new THREE.Vector2(1600, VIEWPORT_HEIGHT),
  };
};

describe("synthesizeLodCamera", () => {
  it.each([
    { x: 200, y: 0 },
    { x: 0, y: 90 },
    { x: -200, y: -90 },
  ])(
    "keeps MapLibre's asymmetric CSS-pixel offset $x/$y at double buffer resolution",
    (centerOffset) => {
      const frame = buildFrame();
      const map = buildMap({
        cameraToCenterDistance: 1000,
        centerOffset,
        width: 800,
        height: 450,
      });
      const camera = new THREE.PerspectiveCamera();
      const lookTarget = new THREE.Vector3();
      synthesizeLodCamera(camera, map, frame, lookTarget);
      expect(camera.projectionMatrix.elements[8]).toBeCloseTo(
        (-2 * centerOffset.x) / 800,
        12
      );
      expect(camera.projectionMatrix.elements[9]).toBeCloseTo(
        (2 * centerOffset.y) / 450,
        12
      );
      const focus = lookTarget.clone().project(camera);
      expect(focus.x).toBeCloseTo((2 * centerOffset.x) / 800, 9);
      expect(focus.y).toBeCloseTo((-2 * centerOffset.y) / 450, 9);
      const identity = camera.projectionMatrix
        .clone()
        .multiply(camera.projectionMatrixInverse);
      identity.elements.forEach((value, index) =>
        expect(value).toBeCloseTo(new THREE.Matrix4().elements[index], 10)
      );
    }
  );

  it("keeps padded edge coverage and restores the symmetric camera when padding is cleared", () => {
    const frame = buildFrame();
    const camera = new THREE.PerspectiveCamera();
    const plainMap = buildMap({
      cameraToCenterDistance: 1000,
      width: 800,
      height: 450,
    });
    const paddedMap = buildMap({
      cameraToCenterDistance: 1000,
      width: 800,
      height: 450,
      centerOffset: { x: 300, y: 0 },
    });
    synthesizeLodCamera(camera, plainMap, frame);
    const symmetric = camera.projectionMatrix.clone();
    const position = camera.position.clone();
    synthesizeLodCamera(camera, paddedMap, frame);
    expect(camera.position).toEqual(position);
    expect(camera.projectionMatrix.elements[0]).toBeCloseTo(
      symmetric.elements[0],
      12
    );
    expect(camera.projectionMatrix.elements[5]).toBeCloseTo(
      symmetric.elements[5],
      12
    );
    const edge = new THREE.Vector3(-0.98, 0, 0).unproject(camera);
    const paddedFrustum = new THREE.Frustum().setFromProjectionMatrix(
      camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
    );
    expect(paddedFrustum.containsPoint(edge)).toBe(true);
    synthesizeLodCamera(camera, plainMap, frame);
    expect(camera.projectionMatrix).toEqual(symmetric);
    expect(
      new THREE.Frustum()
        .setFromProjectionMatrix(
          camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
        )
        .containsPoint(edge)
    ).toBe(false);
  });
  it("uses MapLibre's public vertical FOV and matching camera distance", () => {
    const fovDegrees = 10;
    const fovRadians = THREE.MathUtils.degToRad(fovDegrees);
    const cameraToCenterDistance =
      (0.5 * VIEWPORT_HEIGHT) / Math.tan(fovRadians / 2);
    const map = buildMap({
      publicFovDegrees: fovDegrees,
      // Reproduces the stale/private value seen after setVerticalFieldOfView.
      privateFovRadians: 0.6435011087932844,
      cameraToCenterDistance,
    });
    const camera = new THREE.PerspectiveCamera();
    const frame = buildFrame();

    expect(synthesizeLodCamera(camera, map, frame)).toBe(true);
    expect(camera.fov).toBeCloseTo(fovDegrees, 10);
    expect(camera.position.y).toBeCloseTo(
      cameraToCenterDistance / WORLD_SIZE / frame.meterScale,
      6
    );
  });

  it("falls back to the transform FOV for map-compatible consumers", () => {
    const privateFovRadians = 0.5;
    const map = buildMap({
      privateFovRadians,
      cameraToCenterDistance: 1000,
    });
    const camera = new THREE.PerspectiveCamera();

    expect(synthesizeLodCamera(camera, map, buildFrame())).toBe(true);
    expect(camera.fov).toBeCloseTo(
      THREE.MathUtils.radToDeg(privateFovRadians),
      10
    );
  });

  it("uses the public center elevation unless the frame overrides it", () => {
    const frame = buildFrame();
    const map = buildMap({
      cameraToCenterDistance: 1000,
      centerElevationMeters: 200,
    });
    const camera = new THREE.PerspectiveCamera();
    const lookTarget = new THREE.Vector3();

    expect(synthesizeLodCamera(camera, map, frame, lookTarget)).toBe(true);
    expect(lookTarget.y).toBeCloseTo(200, 6);

    expect(
      synthesizeLodCamera(
        camera,
        map,
        { ...frame, centerElevationMeters: 350 },
        lookTarget
      )
    ).toBe(true);
    expect(lookTarget.y).toBeCloseTo(350, 6);
  });
});
