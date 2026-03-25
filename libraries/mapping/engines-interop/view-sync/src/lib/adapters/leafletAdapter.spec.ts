import { describe, expect, it } from "vitest";
import { degToRadNumeric, radToDegNumeric } from "@carma/units/helpers";
import type { Meters, Radians } from "@carma/units/types";
import { leafletAdapter } from "./leafletAdapter";

const meters = (value: number): Meters => value as Meters;
const radians = (degrees: number): Radians =>
  degToRadNumeric(degrees)! as Radians;

describe("leafletAdapter", () => {
  it("round-trips leaflet view values through view-state conversion", () => {
    const snapshot = leafletAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
      },
      155.6
    );

    expect(snapshot).not.toBeNull();
    expect(radToDegNumeric(snapshot!.longitude)).toBeCloseTo(7.2061216, 7);
    expect(radToDegNumeric(snapshot!.latitude)).toBeCloseTo(51.2712774, 7);
    expect(snapshot!.altitude).toBeCloseTo(155.6, 7);
    expect(snapshot!.zoom).toBeCloseTo(15.4, 6);

    const values = leafletAdapter.toFramework(snapshot!);

    expect(values).toEqual({
      lng: expect.closeTo(7.2061216, 7),
      lat: expect.closeTo(51.2712774, 7),
      zoom: expect.closeTo(16.4, 6),
    });
  });

  it("keeps leaflet latitude=90 in view-state while projecting finite map output", () => {
    const snapshot = leafletAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 90,
        zoom: 10,
      },
      155.6
    );

    expect(snapshot).not.toBeNull();
    expect(radToDegNumeric(snapshot!.latitude)).toBe(90);

    const values = leafletAdapter.toFramework(snapshot!);

    expect(values).not.toBeNull();
    expect(values?.lat).toBe(90);
    expect(Number.isFinite(values?.zoom)).toBe(true);
    expect(snapshot!.range).toBeGreaterThan(0);
  });

  it("prefers stored zoom over recomputing from range", () => {
    const snapshot = leafletAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
      },
      155.6
    );

    expect(snapshot).not.toBeNull();

    const values = leafletAdapter.toFramework({
      ...snapshot!,
      zoom: 15.4,
      range: meters(10),
    });

    expect(values?.zoom).toBeCloseTo(16.4, 6);
  });

  it("preserves prior bearing and pitch when deriving shared state from leaflet", () => {
    const snapshot = leafletAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
      },
      155.6,
      {
        previousViewState: {
          longitude: radians(7.2061216),
          latitude: radians(51.2712774),
          altitude: meters(155.6),
          zoom: 15.4,
          bearing: radians(180),
          pitch: radians(35),
          range: meters(500),
          fovVertical: radians(55),
        },
      }
    );

    expect(snapshot).not.toBeNull();
    expect(radToDegNumeric(snapshot!.bearing)).toBeCloseTo(180, 7);
    expect(radToDegNumeric(snapshot!.pitch)).toBeCloseTo(35, 7);
    expect(radToDegNumeric(snapshot!.fovVertical!)).toBeCloseTo(55, 7);
  });

  it("can explicitly reset heading, pitch, and roll while preserving center and zoom", () => {
    const snapshot = leafletAdapter.toCarmaViewState(
      {
        lng: 7.2061216,
        lat: 51.2712774,
        zoom: 16.4,
      },
      155.6,
      {
        previousViewState: {
          longitude: radians(7.2061216),
          latitude: radians(51.2712774),
          altitude: meters(155.6),
          zoom: 15.4,
          bearing: radians(180),
          pitch: radians(35),
          roll: radians(12),
          range: meters(500),
          fovVertical: radians(55),
        },
        resetHeadingPitchRoll: true,
      }
    );

    expect(snapshot).not.toBeNull();
    expect(radToDegNumeric(snapshot!.bearing)).toBeCloseTo(0, 7);
    expect(radToDegNumeric(snapshot!.pitch)).toBeCloseTo(0, 7);
    expect(snapshot!.roll).toBeUndefined();
    expect(radToDegNumeric(snapshot!.fovVertical!)).toBeCloseTo(55, 7);
  });
});
