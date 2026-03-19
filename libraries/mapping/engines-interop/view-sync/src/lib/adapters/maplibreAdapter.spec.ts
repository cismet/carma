import { describe, expect, it } from "vitest";
import type { SceneState } from "@carma-mapping/engines/cesium/api";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "@carma/geo/utils";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import { maplibreAdapter as maplibreAdapterTyped } from "./maplibreAdapter";
import {
  readVerticalFovRad,
  readViewStateFromSceneState,
} from "../core/targetState";
import type { ViewState } from "../core/types";

const maplibreAdapter = maplibreAdapterTyped;

const toDeg = (rad: number) => radToDegNumeric(rad)!;
const toRad = (deg: number) => degToRadNumeric(deg)!;
const asRadians = (value: number) => value as ViewState["bearing"];
const asMeters = (value: number) => value as ViewState["altitude"];

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
    const expectedPitchDeg = toDeg(pitchRad + Math.PI / 2);
    const expectedRollDeg = toDeg(rollRad);

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

    const snapshot = readViewStateFromSceneState(sceneState);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.altitude).toBe(180);
    expect(toDeg(snapshot?.longitude ?? 0)).toBeCloseTo(expectedLngDeg, 7);
    expect(toDeg(snapshot?.latitude ?? 0)).toBeCloseTo(expectedLatDeg, 7);
    expect(toDeg(snapshot?.bearing ?? 0)).toBeCloseTo(expectedBearingDeg, 7);
    expect(toDeg(snapshot?.pitch ?? 0)).toBeCloseTo(expectedPitchDeg, 7);
    expect(toDeg(snapshot?.roll ?? 0)).toBeCloseTo(expectedRollDeg, 7);
    expect(snapshot?.fovVertical).toBeUndefined();
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

    const snapshot = readViewStateFromSceneState(sceneState);
    expect(snapshot).not.toBeNull();

    const maplibreParams = maplibreAdapter.toHashParams(snapshot!);

    expect(maplibreParams.lng).toBeCloseTo(0, 7);
    expect(maplibreParams.lat).toBeCloseTo(0, 7);
    expect(maplibreParams.altitude).toBe(120);
    expect(maplibreParams.bearing ?? 0).toBeCloseTo(expectedBearingDeg, 7);
    expect(maplibreParams.pitch).toBeCloseTo(30, 7);
    expect(maplibreParams.zoom ?? 0).toBeCloseTo(17.47, 2);
  });

  it("round-trips maplibre view values through carma conversion", () => {
    const snapshot = maplibreAdapter.toCarmaViewState({
      lng: 7.2061216,
      lat: 51.2712774,
      zoom: 16.4,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 57.3,
    });

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.longitude ?? 0)).toBeCloseTo(7.2061216, 7);
    expect(toDeg(snapshot?.latitude ?? 0)).toBeCloseTo(51.2712774, 7);
    expect(snapshot?.altitude).toBeCloseTo(155.6, 7);
    expect(snapshot?.zoom).toBeCloseTo(16.4, 6);
    expect(toDeg(snapshot?.bearing ?? 0)).toBeCloseTo(278.4, 7);
    expect(toDeg(snapshot?.pitch ?? 0)).toBeCloseTo(57.3, 7);

    const params = maplibreAdapter.toFramework(snapshot!);

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
    const params = maplibreAdapter.toFramework({
      longitude: asRadians(toRad(7.2)),
      latitude: asRadians(toRad(51.27)),
      altitude: asMeters(155.6),
      bearing: asRadians(0),
      pitch: asRadians(toRad(0)),
      range: asMeters(750),
      fovVertical: asRadians(toRad(50)),
    });

    expect(params).not.toBeNull();
    expect(params!.lng).toBeCloseTo(7.2, 7);
    expect(params!.lat).toBeCloseTo(51.27, 7);
    expect(params!.altitude).toBeCloseTo(155.6, 7);
    expect(params).not.toHaveProperty("bearing");
    expect(params).not.toHaveProperty("pitch");
  });

  it("sanitizes maplibre pitch to a tiny positive epsilon when bearing is non-zero at nadir", () => {
    const params = maplibreAdapter.toFramework({
      longitude: asRadians(toRad(7.2)),
      latitude: asRadians(toRad(51.27)),
      altitude: asMeters(155.6),
      bearing: asRadians(toRad(45)),
      pitch: asRadians(0),
      range: asMeters(750),
      fovVertical: asRadians(toRad(45)),
    });

    expect(params).not.toBeNull();
    expect(params!.bearing).toBeCloseTo(45, 7);
    expect(params!.pitch).toBeGreaterThan(0);
    expect(params!.pitch).toBeLessThan(0.001);
  });

  it("clamps negative maplibre pitch to zero", () => {
    const params = maplibreAdapter.toFramework({
      longitude: asRadians(toRad(7.2)),
      latitude: asRadians(toRad(51.27)),
      altitude: asMeters(155.6),
      bearing: asRadians(0),
      pitch: asRadians(toRad(-15)),
      range: asMeters(750),
      fovVertical: asRadians(toRad(45)),
    });

    expect(params).not.toBeNull();
    expect(params).not.toHaveProperty("bearing");
    expect(params).not.toHaveProperty("pitch");
  });

  it("round-trips explicit fov through maplibre conversion", () => {
    const snapshot = maplibreAdapter.toCarmaViewState({
      lng: 7.2061216,
      lat: 51.2712774,
      zoom: 15.2,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 57.3,
      fovDeg: 45,
    });

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.fovVertical ?? 0)).toBeCloseTo(45, 7);

    const roundTripped = maplibreAdapter.toFramework(snapshot!);

    expect(roundTripped).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(15.2, 6),
      altitude: expect.closeTo(155.6, 7),
      bearing: expect.closeTo(278.4, 7),
      pitch: expect.closeTo(57.3, 7),
    });
  });

  it("prefers stored zoom over recomputing from range", () => {
    const snapshot = maplibreAdapter.toCarmaViewState({
      lng: 7.2061216,
      lat: 51.2712774,
      zoom: 16.4,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 57.3,
    });

    expect(snapshot).not.toBeNull();

    const params = maplibreAdapter.toFramework({
      ...snapshot!,
      zoom: 16.4,
      range: asMeters(10),
    });

    expect(params?.zoom).toBeCloseTo(16.4, 6);
  });

  it("reads Cesium frustum.fov as vertical FOV on wide viewports", () => {
    const fovVerticalRad = readVerticalFovRad(
      {
        frustum: {
          fov: Math.PI / 2,
        },
      },
      {
        canvas: {
          clientWidth: 2000,
          clientHeight: 1000,
        },
      }
    );
    expect(toDeg(fovVerticalRad ?? 0)).toBeCloseTo(53.130102, 5);
  });

  it("omits fov in carmaToHashParams when it matches the configured default", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(toRad(12)),
        pitch: asRadians(toRad(55)),
        range: asMeters(750),
        fovVertical: asRadians(toRad(45)),
      },
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

  it("omits roll in carmaToHashParams when it is close to zero", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(0),
        pitch: asRadians(0),
        range: asMeters(750),
        roll: asRadians(1e-12),
      },
      { defaultFovDeg: 45 }
    );

    expect(params).not.toHaveProperty("roll");
  });

  it("omits zero bearing and pitch in carmaToHashParams", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(0),
        pitch: asRadians(0),
        range: asMeters(750),
        fovVertical: asRadians(toRad(45)),
      },
      { defaultFovDeg: 45 }
    );

    expect(params.lng).toBeCloseTo(7.2, 7);
    expect(params.lat).toBeCloseTo(51.27, 7);
    expect(params.altitude).toBeCloseTo(155.6, 7);
    expect(params.zoom).toBeDefined();
    expect(params).not.toHaveProperty("bearing");
    expect(params).not.toHaveProperty("pitch");
  });

  it("omits wrapped roll when it is within 0.01 degrees of zero", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(toRad(12)),
        pitch: asRadians(toRad(55)),
        range: asMeters(750),
        fovVertical: asRadians(toRad(45)),
        roll: asRadians(toRad(359.995)),
      },
      { defaultFovDeg: 45 }
    );

    expect(params).not.toHaveProperty("roll");
  });

  it("writes wrapped roll when it is more than 0.01 degrees from zero", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(toRad(12)),
        pitch: asRadians(toRad(55)),
        range: asMeters(750),
        fovVertical: asRadians(toRad(45)),
        roll: asRadians(toRad(359.98)),
      },
      { defaultFovDeg: 45 }
    );

    expect(params.roll).toBeCloseTo(359.98, 7);
  });

  it("writes zoom for valid web-mercator latitudes even when range is present", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.1880253)),
        latitude: asRadians(toRad(51.2717904)),
        altitude: asMeters(201.15),
        bearing: asRadians(toRad(360)),
        pitch: asRadians(toRad(45.01)),
        range: asMeters(1021.8),
      },
      { defaultFovDeg: 60 }
    );

    expect(params.lng).toBeCloseTo(7.1880253, 7);
    expect(params.lat).toBeCloseTo(51.2717904, 7);
    expect(params.altitude).toBeCloseTo(201.15, 2);
    expect(params.zoom).toBeCloseTo(16.282, 3);
    expect(params.bearing).toBeCloseTo(360, 2);
    expect(params.pitch).toBeCloseTo(45.01, 2);
    expect(params).not.toHaveProperty("range");
  });

  it("omits zoom from hash params outside web-mercator bounds", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.1880253)),
        latitude: asRadians(toRad(86)),
        altitude: asMeters(201.15),
        bearing: asRadians(toRad(25)),
        pitch: asRadians(toRad(45.01)),
        range: asMeters(1021.8),
      },
      { defaultFovDeg: 60 }
    );

    expect(params.lng).toBeCloseTo(7.1880253, 7);
    expect(params.lat).toBeCloseTo(86, 7);
    expect(params.range).toBeCloseTo(1021.8, 2);
    expect(params).not.toHaveProperty("zoom");
  });

  it("writes non-zero roll in degrees to carmaToHashParams", () => {
    const params = maplibreAdapter.toHashParams(
      {
        longitude: asRadians(toRad(7.2)),
        latitude: asRadians(toRad(51.27)),
        altitude: asMeters(155.6),
        bearing: asRadians(0),
        pitch: asRadians(0),
        range: asMeters(750),
        roll: asRadians(toRad(12.5)),
      },
      { defaultFovDeg: 45 }
    );

    expect(params.roll).toBeCloseTo(12.5, 7);
  });

  it("uses the configured default fov when decoding without explicit fov", () => {
    const snapshot = maplibreAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 15.2,
        altitude: 155.6,
      },
      { defaultFovDeg: 45 }
    );

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.fovVertical ?? 0)).toBeCloseTo(45, 7);

    const roundTripped = maplibreAdapter.toFramework(snapshot!, {
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
    const withoutPitch = maplibreAdapter.toCarmaViewState(
      {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
      },
      { defaultFovDeg: 45 }
    );

    const withZeroPitch = maplibreAdapter.toCarmaViewState(
      {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
        pitch: 0,
      },
      { defaultFovDeg: 45 }
    );

    expect(withoutPitch).toEqual(withZeroPitch);
    expect(toDeg(withoutPitch?.pitch ?? 0)).toBeCloseTo(0, 7);
  });

  it("clamps absurdly small zoom-decoded restore ranges to a sane minimum", () => {
    const snapshot = maplibreAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 24,
        altitude: 155.6,
      },
      { defaultFovDeg: 45 }
    );

    expect(snapshot).not.toBeNull();
    expect(snapshot?.range).toBeGreaterThanOrEqual(10);
  });

  it("round-trips maplibre view values at latitude above 85 degrees", () => {
    const values = {
      lng: 7.2061216,
      lat: 85.6,
      zoom: 10.25,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 40,
      fovDeg: 45,
    };

    const snapshot = maplibreAdapter.toCarmaViewState(values);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.range).toBeGreaterThan(0);
    expect(toDeg(snapshot?.latitude ?? 0)).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);

    const roundTrip = maplibreAdapter.toFramework(snapshot!);

    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.lat).toBeCloseTo(WEB_MERCATOR_MAX_LATITUDE_DEG, 6);
    expect(roundTrip?.zoom).toBeCloseTo(values.zoom, 6);
    expect(roundTrip?.bearing).toBeCloseTo(values.bearing, 6);
    expect(roundTrip?.pitch).toBeCloseTo(values.pitch, 6);
  });

  it("hydrates maplibre view-state from string hash values", () => {
    const hydrated = maplibreAdapter.fromHashValues({
      lng: "7.2061216",
      lat: "51.2712774",
      zoom: "16.4",
      altitude: "155.6",
      bearing: "278.4",
      pitch: "57.3",
      fov: "45",
    });

    expect(hydrated).not.toBeNull();
    expect(toDeg(hydrated?.longitude ?? 0)).toBeCloseTo(7.2061216, 7);
  });

  it("prefers zoom over range when restoring valid web-mercator latitudes", () => {
    const restored = maplibreAdapter.fromHashValues(
      {
        lng: 7.1880253,
        lat: 51.2717904,
        zoom: 16.282,
        altitude: 201.15,
        bearing: 360,
        pitch: 45.01,
        range: 5000,
      },
      { defaultFovDeg: 60 }
    );

    expect(restored).not.toBeNull();
    expect(toDeg(restored?.latitude ?? 0)).toBeCloseTo(51.2717904, 7);
    expect(restored?.range).not.toBeCloseTo(5000, 2);
    expect(restored?.range ?? 0).toBeCloseTo(1021.83, 2);
  });

  it("uses range as restore fallback outside web-mercator bounds", () => {
    const restored = maplibreAdapter.fromHashValues(
      {
        lng: 7.1880253,
        lat: 86,
        zoom: 16.282,
        altitude: 201.15,
        bearing: 360,
        pitch: 45.01,
        range: 1021.8,
      },
      { defaultFovDeg: 60 }
    );

    expect(restored).not.toBeNull();
    expect(toDeg(restored?.latitude ?? 0)).toBeCloseTo(86, 7);
    expect(restored?.range ?? 0).toBeCloseTo(1021.8, 2);
  });

  it("clamps latitude=90 to web-mercator extent and produces finite maplibre params", () => {
    const snapshot = maplibreAdapter.toCarmaViewState({
      lng: 7.2061216,
      lat: 90,
      zoom: 10,
      altitude: 155.6,
    });

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.latitude ?? 0)).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);

    const roundTrip = maplibreAdapter.toFramework(snapshot!);

    expect(roundTrip).not.toBeNull();
    expect(roundTrip?.lat).toBe(WEB_MERCATOR_MAX_LATITUDE_DEG);
    expect(Number.isFinite(roundTrip?.zoom)).toBe(true);
    expect(snapshot?.range).toBeGreaterThan(0);
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

    const snapshot = readViewStateFromSceneState(sceneState);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.bearing).toBeCloseTo(7.4, 8);
    expect(snapshot?.pitch).toBeCloseTo(-4 + Math.PI / 2, 8);
    expect(snapshot?.roll).toBeCloseTo(-Math.PI, 8);
  });
});
