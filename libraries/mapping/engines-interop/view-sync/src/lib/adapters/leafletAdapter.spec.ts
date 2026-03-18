import { describe, expect, it } from "vitest";
import { radToDegNumeric } from "@carma/units/helpers";
import { leafletAdapter } from "./leafletAdapter";

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
      range: 10,
    });

    expect(values?.zoom).toBeCloseTo(16.4, 6);
  });
});
