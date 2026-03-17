import { describe, expect, it } from "vitest";
import type { SceneStateSnapshot } from "@carma/types";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import {
  decodeSceneStateHashSnapshot,
  encodeSceneStateHashSnapshot,
  readMapLibrePlusElevationHashValuesFromSceneState,
  readSceneStateFromMapLibrePlusElevationHashValues,
} from "./sceneStateHashCodec";
import {
  readMapLibreCompatHashParamsFromSceneState,
  readSceneStateHashSnapshotFromCamera,
} from "./sceneStateHashCameraAdapter";
import { readSceneStateHashSnapshotFromSceneState } from "./sceneStateHashSceneAdapter";

const toDeg = (rad: number) => radToDegNumeric(rad)!;
const toRad = (deg: number) => degToRadNumeric(deg)!;

describe("sceneStateHash codec + adapters", () => {
  it("encodes and decodes camera hash snapshots", () => {
    const bearingRad = toRad(201.25);
    const pitchRad = toRad(-57.8);
    const rollRad = toRad(0);
    const fovVerticalRad = toRad(52.5);

    const encoded = encodeSceneStateHashSnapshot({
      anchor: {
        lngDeg: 7.1543214,
        latDeg: 51.2567891,
        heightM: 432.12,
        source: "screen-center",
      },
      orientation: {
        bearingRad,
        pitchRad,
        rollRad,
        fovVerticalRad,
        rangeM: 321.45,
      },
    });

    const decoded = decodeSceneStateHashSnapshot(encoded);
    expect(decoded).not.toBeUndefined();
    expect(decoded!.anchor).toEqual({
      lngDeg: 7.1543214,
      latDeg: 51.2567891,
      heightM: 432.12,
      source: "screen-center",
    });
    expect(decoded!.orientation.bearingRad).toBeCloseTo(bearingRad, 7);
    expect(decoded!.orientation.pitchRad).toBeCloseTo(pitchRad, 7);
    expect(decoded!.orientation.rollRad).toBeCloseTo(rollRad, 7);
    expect(decoded!.orientation.fovVerticalRad).toBeCloseTo(fovVerticalRad, 7);
    expect(decoded!.orientation.rangeM).toBe(321.45);
  });

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

    const sceneState: SceneStateSnapshot = {
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
    };

    const snapshot = readSceneStateHashSnapshotFromSceneState({
      sceneState,
      anchorMode: "screen-center",
      fallbackHeightM: 200,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.source).toBe("screen-center");
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

    const sceneState: SceneStateSnapshot = {
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
    };

    const snapshot = readSceneStateHashSnapshotFromSceneState({
      sceneState,
      anchorMode: "screen-center",
      fallbackHeightM: 200,
    });
    expect(snapshot).not.toBeNull();

    const mapLibreParams = readMapLibreCompatHashParamsFromSceneState({
      snapshot: snapshot!,
      sceneState,
      scene: {
        canvas: {
          clientWidth: 1000,
          clientHeight: 1000,
        },
      },
      includeAltitude: true,
    });

    expect(mapLibreParams.lng).toBeCloseTo(0, 7);
    expect(mapLibreParams.lat).toBeCloseTo(0, 7);
    expect(mapLibreParams.altitude).toBe(120);
    expect(mapLibreParams.bearing ?? 0).toBeCloseTo(expectedBearingDeg, 7);
    expect(mapLibreParams.pitch).toBeCloseTo(30, 7);
    expect(mapLibreParams.zoom ?? 0).toBeCloseTo(17.05, 2);
  });

  it("round-trips maplibre-plus-elevation hash values through snapshot conversion", () => {
    const snapshot = readSceneStateFromMapLibrePlusElevationHashValues({
      values: {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
        altitude: 155.6,
        bearing: 278.4,
        pitch: 57.3,
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.anchor.lngDeg).toBeCloseTo(7.2061216, 7);
    expect(snapshot?.anchor.latDeg).toBeCloseTo(51.2712774, 7);
    expect(snapshot?.anchor.heightM).toBeCloseTo(155.6, 7);
    expect(toDeg(snapshot?.orientation.bearingRad ?? 0)).toBeCloseTo(278.4, 7);
    expect(toDeg(snapshot?.orientation.pitchRad ?? 0)).toBeCloseTo(-32.7, 7);

    const params = readMapLibrePlusElevationHashValuesFromSceneState({
      snapshot: snapshot!,
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(params).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(16.4, 6),
      altitude: expect.closeTo(155.6, 7),
      bearing: expect.closeTo(278.4, 7),
      pitch: expect.closeTo(57.3, 7),
    });
  });

  it("omits zero bearing and pitch and includes non-standard fov in maplibre-plus-elevation hash params", () => {
    const params = readMapLibrePlusElevationHashValuesFromSceneState({
      snapshot: {
        anchor: {
          lngDeg: 7.2,
          latDeg: 51.27,
          heightM: 155.6,
          source: "screen-center",
        },
        orientation: {
          bearingRad: 0,
          pitchRad: toRad(-90),
          rangeM: 750,
          fovVerticalRad: toRad(50),
        },
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(params).toEqual({
      lng: expect.closeTo(7.2, 7),
      lat: expect.closeTo(51.27, 7),
      zoom: expect.any(Number),
      altitude: expect.closeTo(155.6, 7),
      fov: 50,
    });
    expect(params).not.toHaveProperty("bearing");
    expect(params).not.toHaveProperty("pitch");
  });

  it("round-trips explicit fov through maplibre-plus-elevation snapshot conversion", () => {
    const params = {
      lng: 7.2061216,
      lat: 51.2712774,
      zoom: 15.2,
      altitude: 155.6,
      bearing: 278.4,
      pitch: 57.3,
      fov: 45,
    };

    const snapshot = readSceneStateFromMapLibrePlusElevationHashValues({
      values: params,
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.orientation.fovVerticalRad ?? 0)).toBeCloseTo(45, 7);

    const roundTrippedParams =
      readMapLibrePlusElevationHashValuesFromSceneState({
        snapshot: snapshot!,
        viewportWidthPx: 1400,
        viewportHeightPx: 900,
      });

    expect(roundTrippedParams).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(15.2, 6),
      altitude: expect.closeTo(155.6, 7),
      bearing: expect.closeTo(278.4, 7),
      pitch: expect.closeTo(57.3, 7),
      fov: 45,
    });
  });

  it("reads Cesium frustum.fov as vertical FOV on wide viewports", () => {
    const snapshot = readSceneStateHashSnapshotFromCamera({
      camera: {
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
      scene: {
        canvas: {
          clientWidth: 2000,
          clientHeight: 1000,
        },
      },
      anchorMode: "camera-position",
    });

    expect(snapshot).not.toBeNull();
    expect(toDeg(snapshot?.orientation.fovVerticalRad ?? 0)).toBeCloseTo(
      53.130102,
      5
    );
  });

  it("omits fov when it matches the configured app default", () => {
    const params = readMapLibrePlusElevationHashValuesFromSceneState({
      snapshot: {
        anchor: {
          lngDeg: 7.2,
          latDeg: 51.27,
          heightM: 155.6,
          source: "screen-center",
        },
        orientation: {
          bearingRad: toRad(12),
          pitchRad: toRad(-35),
          rangeM: 750,
          fovVerticalRad: toRad(45),
        },
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      defaultFovDeg: 45,
    });

    expect(params.lng).toBeCloseTo(7.2, 7);
    expect(params.lat).toBeCloseTo(51.27, 7);
    expect(params.altitude).toBeCloseTo(155.6, 7);
    expect(params.bearing).toBeCloseTo(12, 7);
    expect(params.pitch).toBeCloseTo(55, 7);
    expect(params).toHaveProperty("zoom");
    expect(params).not.toHaveProperty("fov");
  });

  it("uses the configured default fov when decoding hashes without an explicit fov", () => {
    const snapshot = readSceneStateFromMapLibrePlusElevationHashValues({
      values: {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 15.2,
        altitude: 155.6,
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      defaultFovDeg: 45,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.fovVerticalRad).toBeUndefined();

    const roundTrippedParams =
      readMapLibrePlusElevationHashValuesFromSceneState({
        snapshot: snapshot!,
        viewportWidthPx: 1400,
        viewportHeightPx: 900,
        defaultFovDeg: 45,
      });

    expect(roundTrippedParams).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(15.2, 6),
      altitude: expect.closeTo(155.6, 7),
    });
  });

  it("treats omitted map pitch as equivalent to explicit pitch=0 on restore", () => {
    const withoutPitch = readSceneStateFromMapLibrePlusElevationHashValues({
      values: {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      defaultFovDeg: 45,
    });

    const withZeroPitch = readSceneStateFromMapLibrePlusElevationHashValues({
      values: {
        lng: 7.1159858,
        lat: 51.2478262,
        zoom: 19.084,
        altitude: 153.75,
        pitch: 0,
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      defaultFovDeg: 45,
    });

    expect(withoutPitch).toEqual(withZeroPitch);
    expect(toDeg(withoutPitch?.orientation.pitchRad ?? 0)).toBeCloseTo(-90, 7);
  });

  it("clamps absurdly small zoom-decoded restore ranges to a sane minimum", () => {
    const snapshot = readSceneStateFromMapLibrePlusElevationHashValues({
      values: {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 24,
        altitude: 155.6,
      },
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
      defaultFovDeg: 45,
    });

    expect(snapshot).not.toBeNull();
    expect(snapshot?.orientation.rangeM).toBeGreaterThanOrEqual(10);
  });
});
