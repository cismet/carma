import { describe, expect, it, vi } from "vitest";
import { CAMERA_TYPE } from "@carma-commons/camera/model";
import { degToRadNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { buildViewState } from "../core/construct";
import { deriveOrbitAngles, deriveZoom } from "../core/derivations";
import type { Map as LeafletMap } from "leaflet";
import { applyToLeaflet, readFromLeaflet } from "./leaflet";

const meters = (value: number): Meters => value as Meters;
const radians = (valueDeg: number): Radians =>
  degToRadNumeric(valueDeg)! as Radians;

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

describe("applyToLeaflet", () => {
  it("applies the target view when center or zoom differs", () => {
    const setView = vi.fn();
    const map = {
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => 0,
      setView,
    };

    applyToLeaflet(map as unknown as LeafletMap, buildTestState());

    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Number),
      {
        animate: false,
      }
    );
  });

  it("skips setView when the projected center and zoom are unchanged", () => {
    let center = { lat: 0, lng: 0 };
    let zoom = 0;
    const setView = vi.fn((nextCenter: [number, number], nextZoom: number) => {
      center = { lat: nextCenter[0], lng: nextCenter[1] };
      zoom = nextZoom;
    });

    const map = {
      getCenter: () => center,
      getZoom: () => zoom,
      setView,
    };

    const state = buildTestState();
    applyToLeaflet(map as unknown as LeafletMap, state);
    applyToLeaflet(map as unknown as LeafletMap, state);

    expect(setView).toHaveBeenCalledTimes(1);
  });

  it("derives zoom from the current leaflet container when state viewport is unknown", () => {
    const state = buildTestState();
    const setView = vi.fn();
    const map = {
      getCenter: () => ({ lat: 0, lng: 0 }),
      getZoom: () => 0,
      getContainer: () =>
        ({
          clientWidth: 480,
          clientHeight: 900,
        } as HTMLElement),
      setView,
    };

    applyToLeaflet(map as unknown as LeafletMap, state);

    expect(setView).toHaveBeenCalledWith(
      expect.any(Array),
      deriveZoom(state, 480, 900) + 1,
      { animate: false }
    );
    expect(deriveZoom(state) - deriveZoom(state, 480, 900)).toBeGreaterThan(
      0.9
    );
  });
});

describe("readFromLeaflet", () => {
  it("stores the live container viewport so derived zoom round-trips", () => {
    const state = readFromLeaflet(
      {
        getCenter: () => ({ lng: 7.2, lat: 51.27 }),
        getZoom: () => 17.25,
        getContainer: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLElement),
        setView: vi.fn(),
      } as unknown as LeafletMap,
      "spec",
      { fovDeg: 60 }
    );

    expect(state).not.toBeNull();
    expect(state?.intrinsics.viewOffset?.width).toBe(480);
    expect(state?.intrinsics.viewOffset?.height).toBe(900);
    expect(deriveZoom(state!) + 1).toBeCloseTo(17.25, 6);
  });

  it("preserves seed bearing and pitch for 2d leaflet-only moves", () => {
    const seedState = buildTestState();
    const state = readFromLeaflet(
      {
        getCenter: () => ({ lng: 7.25, lat: 51.28 }),
        getZoom: () => 17.25,
        getContainer: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLElement),
        setView: vi.fn(),
      } as unknown as LeafletMap,
      "spec",
      { seedState }
    );

    expect(state).not.toBeNull();
    expect(deriveZoom(state!) + 1).toBeCloseTo(17.25, 6);

    const seedOrbit = deriveOrbitAngles(seedState);
    const nextOrbit = deriveOrbitAngles(state!);

    expect(nextOrbit.bearing).toBeCloseTo(seedOrbit.bearing, 6);
    expect(nextOrbit.pitch).toBeCloseTo(seedOrbit.pitch, 6);
    expect(state?.intrinsics.fov).toBe(seedState.intrinsics.fov);
  });

  it("returns null for transient leaflet reads during invalid map state", () => {
    const state = readFromLeaflet(
      {
        getCenter: () => {
          throw new TypeError(
            "Cannot read properties of undefined (reading '_leaflet_pos')"
          );
        },
        getZoom: () => 17.25,
        getContainer: () =>
          ({
            clientWidth: 480,
            clientHeight: 900,
          } as HTMLElement),
      } as unknown as LeafletMap,
      "spec"
    );

    expect(state).toBeNull();
  });
});
