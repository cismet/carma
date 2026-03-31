import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";

import { buildViewState } from "../core/construct";
import { deriveOrbitAngles, deriveZoom } from "../core/derivations";
import { applyToMaplibre, readFromMaplibre } from "./maplibre";
const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;
const degrees = (valueRad: number): number => radToDegNumeric(valueRad)!;

const buildTestState = () =>
  buildViewState({
    longitude: radians(7.2),
    latitude: radians(51.27),
    altitude: meters(180),
    bearing: radians(195),
    pitch: radians(58),
    range: meters(620),
    intrinsics: {
      type: CAMERA_TYPE.PERSPECTIVE,
      fov: radians(60),
    },
    metadata: {
      frameId: 1,
      timestampMs: 1_700_000_000_000,
      sourceId: "spec",
      source: "sync",
    },
  });

describe("applyToMaplibre", () => {
  it("applies the target view when center, zoom, or angles differ", () => {
    const jumpTo = vi.fn();
    const map = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 0,
      getBearing: () => 0,
      getPitch: () => 0,
      jumpTo,
    };

    applyToMaplibre(map as unknown as MapLibreMap, buildTestState());

    expect(jumpTo).toHaveBeenCalledTimes(1);
  });

  it("skips jumpTo when the projected center, zoom, and angles are unchanged", () => {
    const state = buildTestState();
    const targetCartographic = state.anchorCartographic;
    const targetOrbit = {
      lng: degrees(targetCartographic.longitude as number),
      lat: degrees(targetCartographic.latitude as number),
      zoom: 0,
      bearing: 0,
      pitch: 0,
    };
    let currentView = {
      ...targetOrbit,
    };
    const jumpTo = vi.fn(
      (options: {
        center?: [number, number];
        zoom?: number;
        bearing?: number;
        pitch?: number;
      }) => {
        currentView = {
          lng: options.center?.[0] ?? currentView.lng,
          lat: options.center?.[1] ?? currentView.lat,
          zoom: options.zoom ?? currentView.zoom,
          bearing: options.bearing ?? currentView.bearing,
          pitch: options.pitch ?? currentView.pitch,
        };
      }
    );

    const map = {
      getCenter: () => ({ lng: currentView.lng, lat: currentView.lat }),
      getZoom: () => currentView.zoom,
      getBearing: () => currentView.bearing,
      getPitch: () => currentView.pitch,
      jumpTo,
    };

    applyToMaplibre(map as unknown as MapLibreMap, state);
    applyToMaplibre(map as unknown as MapLibreMap, state);

    expect(jumpTo).toHaveBeenCalledTimes(1);
  });

  it("treats equivalent wrapped bearings as unchanged", () => {
    const state = buildTestState();
    const targetCartographic = state.anchorCartographic;
    const { pitch } = deriveOrbitAngles(state);
    const currentView = {
      lng: degrees(targetCartographic.longitude as number),
      lat: degrees(targetCartographic.latitude as number),
      zoom: deriveZoom(state),
      bearing: -165,
      pitch: degrees(pitch as number),
    };
    const jumpTo = vi.fn();

    const map = {
      getCenter: () => ({ lng: currentView.lng, lat: currentView.lat }),
      getZoom: () => currentView.zoom,
      getBearing: () => currentView.bearing,
      getPitch: () => currentView.pitch,
      jumpTo,
    };

    applyToMaplibre(map as unknown as MapLibreMap, state);

    expect(jumpTo).not.toHaveBeenCalled();
  });

  it("derives zoom from the current map canvas when state viewport is unknown", () => {
    const state = buildTestState();
    const jumpTo = vi.fn();
    const map = {
      getCenter: () => ({ lng: 0, lat: 0 }),
      getZoom: () => 0,
      getBearing: () => 0,
      getPitch: () => 0,
      getCanvas: () =>
        ({
          clientWidth: 480,
          clientHeight: 900,
        } as HTMLCanvasElement),
      jumpTo,
    };

    applyToMaplibre(map as unknown as MapLibreMap, state);

    expect(jumpTo).toHaveBeenCalledWith(
      expect.objectContaining({
        zoom: deriveZoom(state, 480, 900),
      })
    );
    expect(deriveZoom(state) - deriveZoom(state, 480, 900)).toBeGreaterThan(
      0.9
    );
  });
});

describe("readFromMaplibre", () => {
  it("stores the live canvas viewport so derived zoom round-trips", () => {
    const state = readFromMaplibre(
      {
        getCenter: () => ({ lng: 7.2, lat: 51.27 }),
        getZoom: () => 16.25,
        getBearing: () => 0,
        getPitch: () => 0,
        getCanvas: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLCanvasElement),
        jumpTo: vi.fn(),
      } as unknown as MapLibreMap,
      "spec",
      { fovDeg: 60 }
    );

    expect(state).not.toBeNull();
    expect(state?.intrinsics.viewOffset).toBeUndefined();
    expect(state?.metadata.viewport).toEqual({
      widthPx: 480,
      heightPx: 900,
    });
    expect(deriveZoom(state!)).toBeCloseTo(16.25, 6);
  });

  it("reads vertical fov from maplibre runtime and derives horizontal fov from canvas aspect", () => {
    const state = readFromMaplibre(
      {
        getCenter: () => ({ lng: 7.2, lat: 51.27 }),
        getZoom: () => 16.25,
        getBearing: () => 0,
        getPitch: () => 0,
        getVerticalFieldOfView: () => 50,
        getCanvas: () =>
          ({
            clientWidth: 1200,
            clientHeight: 800,
          } as HTMLCanvasElement),
        jumpTo: vi.fn(),
      } as unknown as MapLibreMap,
      "spec"
    );

    expect(state).not.toBeNull();
    expect(degrees(state?.intrinsics.fov as number)).toBeCloseTo(50, 8);
    expect(degrees(state?.intrinsics.fovHorizontal as number)).toBeCloseTo(
      degrees(2 * Math.atan(Math.tan((radians(50) as number) * 0.5) * 1.5)),
      8
    );
    expect(state?.intrinsics.viewOffset).toBeUndefined();
    expect(state?.metadata.viewport).toEqual({
      widthPx: 1200,
      heightPx: 800,
    });
  });

  it("preserves seed altitude and intrinsics that maplibre cannot observe", () => {
    const seedState = buildViewState({
      longitude: radians(7.2),
      latitude: radians(51.27),
      altitude: meters(212.4),
      bearing: radians(214),
      pitch: radians(42),
      range: meters(620),
      intrinsics: {
        type: CAMERA_TYPE.PERSPECTIVE,
        fov: radians(60),
        frustum: {
          near: meters(1),
          far: meters(500_000),
        },
      },
      metadata: {
        frameId: 1,
        timestampMs: 1_700_000_000_000,
        sourceId: "spec",
        source: "sync",
      },
    });

    const state = readFromMaplibre(
      {
        getCenter: () => ({ lng: 7.21, lat: 51.28 }),
        getZoom: () => 16.25,
        getBearing: () => 214,
        getPitch: () => 42,
        getCanvas: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLCanvasElement),
        jumpTo: vi.fn(),
      } as unknown as MapLibreMap,
      "spec",
      { seedState }
    );

    expect(state).not.toBeNull();
    expect(state?.anchorCartographic.altitude).toBeCloseTo(212.4, 6);
    expect(state?.intrinsics.type).toBe(CAMERA_TYPE.PERSPECTIVE);
    expect(state?.intrinsics.fov).toBe(seedState.intrinsics.fov);
    expect(state?.intrinsics.frustum?.near).toBe(
      seedState.intrinsics.frustum?.near
    );
    expect(state?.intrinsics.frustum?.far).toBe(
      seedState.intrinsics.frustum?.far
    );
    expect(state?.intrinsics.viewOffset).toBeUndefined();
    expect(state?.metadata.viewport).toEqual({
      widthPx: 480,
      heightPx: 900,
    });
  });

  it("overrides a seed orthographic camera mode with maplibre runtime perspective intrinsics", () => {
    const seedState = buildViewState({
      longitude: radians(7.2),
      latitude: radians(51.27),
      altitude: meters(212.4),
      bearing: radians(214),
      pitch: radians(42),
      range: meters(620),
      intrinsics: {
        type: CAMERA_TYPE.ORTHOGRAPHIC,
        orthographicScale: {
          metersPerCssPixel: 2.5,
        },
      },
      metadata: {
        frameId: 1,
        timestampMs: 1_700_000_000_000,
        sourceId: "spec",
        source: "sync",
      },
    });

    const state = readFromMaplibre(
      {
        getCenter: () => ({ lng: 7.21, lat: 51.28 }),
        getZoom: () => 16.25,
        getBearing: () => 214,
        getPitch: () => 42,
        getVerticalFieldOfView: () => 50,
        getCanvas: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLCanvasElement),
        jumpTo: vi.fn(),
      } as unknown as MapLibreMap,
      "spec",
      { seedState }
    );

    expect(state).not.toBeNull();
    expect(state?.intrinsics.type).toBe(CAMERA_TYPE.PERSPECTIVE);
    expect(state?.intrinsics.orthographicScale).toBeUndefined();
    expect(state?.intrinsics.fov).toBeDefined();
  });
});
