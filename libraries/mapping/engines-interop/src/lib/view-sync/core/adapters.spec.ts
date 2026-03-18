import { describe, expect, it } from "vitest";
import type { SceneState } from "../core/sceneState";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "@carma/geo/utils";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { maplibreAdapter, leafletAdapter } from "./adapters";
import {
  readSceneViewStateFromCamera,
  readSceneViewStateFromSceneState,
} from "./sceneStateAdapters";

const toDeg = (rad: number) => radToDegNumeric(rad)!;
const toRad = (deg: number) => degToRadNumeric(deg)!;

describe("view adapter round-trips", () => {
  it("builds object-centric snapshot from scene-state using orbit point", () => {
    const orbitLngRad = 0.2;
    const orbitLatRad = 0.8;
    const bearingRad = 0.35;
    const pitchRad = -1.05;
    const rollRad = 0.02;
    const fovRad = 0.8;

    const expectedLngDeg = toDeg(orbitLngRad);
    const expectedLatDeg = toDeg(orbitLatRad);
    const expectedBearingDeg = toDeg(bearingRad);
    const expectedPitchDeg = toDeg(pitchRad);
    const expectedRollDeg = toDeg(rollRad);
    const expectedFovDeg = toDeg(fovRad);

    const sceneState = {
      frameNumber: 42,
      timestampMs: 1234,
      camera: {
        worldPosition: { x: 1, y: 2, z: 3 },
        cartographic: {
          longitude: 0.12,
          latitude: 0.91,
          altitude: 900,
        },
        bearingRad,
        pitchRad,
        rollRad,
        fovVertical: fovRad,
      },
      orbitPoint: {
        worldPosition: { x: 4, y: 5, z: 6 },
        cartographic: {
          longitude: orbitLngRad,
          latitude: orbitLatRad,
          altitude: 180,
        },
        source: "screen-center-depth",
      },
    } as unknown as SceneState;

    const snapshot = readSceneViewStateFromSceneState(sceneState, {
      fallbackHeightM: 200,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.heightM).toBe(180);
    expect(snapshot?.anchor.lngDeg ?? 0).toBeCloseTo(expectedLngDeg, 7);
    expect(snapshot?.anchor.latDeg ?? 0).toBeCloseTo(expectedLatDeg, 7);
    expect(toDeg(snapshot?.orientation.bearingRad ?? 0)).toBeCloseTo(
      expectedBearingDeg,
      7
    );
    expect(toDeg(snapshot?.orientation.pitchRad ?? 0)).toBeCloseTo(
      expectedPitchDeg,
      7
    );
    expect(toDeg(snapshot?.orientation.rollRad ?? 0)).toBeCloseTo(
      expectedRollDeg,
      7
    );
    expect(toDeg(snapshot?.orientation.fovVerticalRad ?? 0)).toBeCloseTo(
      expectedFovDeg,
      7
    );
  });

  it("projects snapshot to maplibre-compatible hash params with altitude", () => {
    const bearingRad = 0.2;
    const expectedBearingDeg = toDeg(bearingRad);

    const sceneState = {
      frameNumber: 7,
      timestampMs: 1000,
      camera: {
        worldPosition: { x: 0, y: 0, z: 1000 },
        cartographic: {
          longitude: 0,
          latitude: 0,
          altitude: 1000,
        },
        bearingRad,
        pitchRad: -Math.PI / 3,
        rollRad: 0,
        fovVertical: Math.PI / 3,
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: 0,
          latitude: 0,
          altitude: 120,
        },
        source: "screen-center-depth",
      },
    } as unknown as SceneState;

    const snapshot = readSceneViewStateFromSceneState(sceneState, {
      fallbackHeightM: 200,
    });
    expect(snapshot).not.toBeNull();

    const maplibreParams = maplibreAdapter.carmaToHashParams(snapshot!, {
      widthPx: 1000,
      heightPx: 1000,
    });

    expect(maplibreParams.lng).toBeCloseTo(0, 7);
    expect(maplibreParams.lat).toBeCloseTo(0, 7);
    expect(maplibreParams.altitude).toBe(120);
    expect(maplibreParams.bearing ?? 0).toBeCloseTo(expectedBearingDeg, 7);
    expect(maplibreParams.pitch).toBeCloseTo(30, 7);
    expect(maplibreParams.zoom ?? 0).toBeCloseTo(17.05, 2);
  });

  it("round-trips maplibre view values through carma conversion", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = maplibreAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
        altitude: 155.6,
        bearing: 278.4,
        pitch: 57.3,
      },
      viewport
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.lngDeg).toBeCloseTo(7.2061216, 7);
    expect(snapshot?.anchor.latDeg).toBeCloseTo(51.2712774, 7);
    expect(snapshot?.anchor.heightM).toBeCloseTo(155.6, 7);
    expect(toDeg(snapshot?.orientation.bearingRad ?? 0)).toBeCloseTo(278.4, 7);
    expect(toDeg(snapshot?.orientation.pitchRad ?? 0)).toBeCloseTo(-32.7, 7);

    const params = maplibreAdapter.carmaToView(snapshot!, viewport);

    expect(params).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(16.4, 6),
      altitude: expect.closeTo(155.6, 7),
      bearing: expect.closeTo(278.4, 7),
      pitch: expect.closeTo(57.3, 7),
    });
  });

  it("omits zero bearing and pitch in carmaToView", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const params = maplibreAdapter.carmaToView(
      {
        anchor: {
          lngDeg: 7.2,
          latDeg: 51.27,
          heightM: 155.6,
        },
        orientation: {
          bearingRad: 0,
          pitchRad: toRad(-90),
          rangeM: 750,
          fovVerticalRad: toRad(50),
        },
      },
      viewport
    );

    expect(params).not.toBeNull();
    expect(params!.lng).toBeCloseTo(7.2, 7);
    expect(params!.lat).toBeCloseTo(51.27, 7);
    expect(params!.altitude).toBeCloseTo(155.6, 7);
    expect(params).not.toHaveProperty("bearing");
    expect(params).not.toHaveProperty("pitch");
  });

  it("round-trips explicit fov through maplibre conversion", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = maplibreAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 15.2,
        altitude: 155.6,
        bearing: 278.4,
        pitch: 57.3,
        fovDeg: 45,
      },
      viewport
    );

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.orientation.fovVerticalRad ?? 0)).toBeCloseTo(45, 7);

    const roundTripped = maplibreAdapter.carmaToView(snapshot!, viewport);

    expect(roundTripped).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(15.2, 6),
      altitude: expect.closeTo(155.6, 7),
      bearing: expect.closeTo(278.4, 7),
      pitch: expect.closeTo(57.3, 7),
    });
  });

  it("reads Cesium frustum.fov as vertical FOV on wide viewports", () => {
    const snapshot = readSceneViewStateFromCamera(
      {
        positionCartographic: {
          longitude: 0,
          latitude: 0,
          height: 1000,
        },
        heading: 0,
        pitch: -Math.PI / 4,
        roll: 0,
        frustum: {
          fov: Math.PI / 2,
        },
      },
      {
        scene: {
          canvas: {
            clientWidth: 2000,
            clientHeight: 1000,
          },
        },
      }
    );
    expect(toDeg(snapshot?.orientation.fovVerticalRad ?? 0)).toBeCloseTo(
      53.130102,
      5
    );
  });

  it("omits fov in carmaToHashParams when it matches the configured default", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const params = maplibreAdapter.carmaToHashParams(
      {
        anchor: {
          lngDeg: 7.2,
          latDeg: 51.27,
          heightM: 155.6,
        },
        orientation: {
          bearingRad: toRad(12),
          pitchRad: toRad(-35),
          rangeM: 750,
          fovVerticalRad: toRad(45),
        },
      },
      viewport,
      { defaultFovDeg: 45 }
    );

    expect(params.lng).toBeCloseTo(7.2, 7);
    expect(params.lat).toBeCloseTo(51.27, 7);
    expect(params.altitude).toBeCloseTo(155.6, 7);
    expect(params.bearing).toBeCloseTo(12, 7);
    expect(params.pitch).toBeCloseTo(55, 7);
    expect(params).toHaveProperty("zoom");
    expect(params).not.toHaveProperty("fov");
  });

  it("uses the configured default fov when decoding without explicit fov", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = maplibreAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 15.2,
        altitude: 155.6,
      },
      viewport,
      { defaultFovDeg: 45 }
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.fovVerticalRad).toBeUndefined();

    const roundTripped = maplibreAdapter.carmaToView(snapshot!, viewport, {
      defaultFovDeg: 45,
    });

    expect(roundTripped).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(15.2, 6),
      altitude: expect.closeTo(155.6, 7),
    });
  });

  it("treats omitted map pitch as equivalent to explicit pitch=0 on restore", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const withoutPitch = maplibreAdapter.viewToCarma(
      {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
      },
      viewport,
      { defaultFovDeg: 45 }
    );

    const withZeroPitch = maplibreAdapter.viewToCarma(
      {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
        pitch: 0,
      },
      viewport,
      { defaultFovDeg: 45 }
    );

    expect(withoutPitch).toEqual(withZeroPitch);
    expect(toDeg(withoutPitch?.orientation.pitchRad ?? 0)).toBeCloseTo(-90, 7);
  });

  it("clamps absurdly small zoom-decoded restore ranges to a sane minimum", () => {
    const snapshot = maplibreAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 24,
        altitude: 155.6,
      },
      { widthPx: 1400, heightPx: 900 },
      { defaultFovDeg: 45 }
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.rangeM).toBeGreaterThanOrEqual(10);
  });

  it("round-trips leaflet view values through carma conversion", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = leafletAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
      },
      viewport,
      155.6
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.lngDeg).toBeCloseTo(7.2061216, 7);
    expect(snapshot?.anchor.latDeg).toBeCloseTo(51.2712774, 7);
    expect(snapshot?.anchor.heightM).toBeCloseTo(155.6, 7);

    const values = leafletAdapter.carmaToView(snapshot!, viewport);

    expect(values).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(16.4, 6),
    });
  });

  it("round-trips maplibre view values at latitude above 85 degrees", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const values = {
      lng: 7.2061216,
      lat: 85.6,
      zoom: 10.25,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 40,
      fovDeg: 45,
    };

    const snapshot = maplibreAdapter.viewToCarma(values, viewport);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.rangeM).toBeGreaterThan(0);
    expect(snapshot?.anchor.latDeg).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);

    const roundTrip = maplibreAdapter.carmaToView(snapshot!, viewport);

    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.lat).toBeCloseTo(WEB_MERCATOR_MAX_LATITUDE_DEG, 6);
    expect(roundTrip?.zoom).toBeCloseTo(values.zoom, 6);
    expect(roundTrip?.bearing).toBeCloseTo(values.bearing, 6);
    expect(roundTrip?.pitch).toBeCloseTo(values.pitch, 6);
  });

  it("hydrates maplibre view-state from string hash values", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const hydrated = maplibreAdapter.hydrateToCarma(
      {
        lng: "7.2061216",
        lat: "51.2712774",
        zoom: "16.4",
        altitude: "155.6",
        bearing: "278.4",
        pitch: "57.3",
        fov: "45",
      },
      viewport
    );

    expect(hydrated).not.toBeNull();
    expect(hydrated?.anchor.lngDeg).toBeCloseTo(7.2061216, 7);
  });

  it("clamps latitude=90 to web-mercator extent and produces finite maplibre params", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = maplibreAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 90,
        zoom: 10,
        altitude: 155.6,
      },
      viewport
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.latDeg).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);

    const roundTrip = maplibreAdapter.carmaToView(snapshot!, viewport);

    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.lat).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);
    expect(Number.isFinite(roundTrip?.zoom)).toBe(true);
    expect(snapshot?.orientation.rangeM).toBeGreaterThan(0);
  });

  it("clamps leaflet latitude=90 to web-mercator extent while producing finite zoom", () => {
    const viewport = { widthPx: 1400, heightPx: 900 };
    const snapshot = leafletAdapter.viewToCarma(
      {
        lng: 7.2061216,
        lat: 90,
        zoom: 10,
      },
      viewport,
      155.6
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.latDeg).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);

    const values = leafletAdapter.carmaToView(snapshot!, viewport);

    expect(values).not.toBeNull();
    expect(values?.lat).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);
    expect(Number.isFinite(values?.zoom)).toBe(true);
    expect(snapshot?.orientation.rangeM).toBeGreaterThan(0);
  });

  it("normalizes scene-state angles into canonical ranges", () => {
    const sceneState = {
      frameNumber: 1,
      timestampMs: 1,
      camera: {
        worldPosition: { x: 100, y: 100, z: 100 },
        cartographic: {
          longitude: toRad(7.2),
          latitude: toRad(51.27),
          altitude: 500,
        },
        bearingRad: 7.4,
        pitchRad: -4,
        rollRad: -Math.PI,
        fovVertical: toRad(45),
      },
      orbitPoint: {
        worldPosition: { x: 0, y: 0, z: 0 },
        cartographic: {
          longitude: toRad(7.2),
          latitude: toRad(51.27),
          altitude: 155.6,
        },
        source: "screen-center-depth",
      },
    } as unknown as SceneState;

    const snapshot = readSceneViewStateFromSceneState(sceneState, {
      fallbackHeightM: 200,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.bearingRad).toBeGreaterThanOrEqual(0);
    expect(snapshot?.orientation.bearingRad).toBeLessThan(2 * Math.PI);
    expect(snapshot?.orientation.pitchRad).toBeGreaterThan(-Math.PI);
    expect(snapshot?.orientation.pitchRad).toBeLessThanOrEqual(Math.PI);
    expect(snapshot?.orientation.rollRad).toBe(Math.PI);
  });
});
