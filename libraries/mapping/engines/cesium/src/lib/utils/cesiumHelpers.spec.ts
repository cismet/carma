// cesiumHelpers.test.ts

import {
  getMercatorScaleFactorAtLatitude,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
  getZoomFromPixelResolutionAtLatitude,
  getPixelResolutionFromZoomAtLatitude,
  EARTH_CIRCUMFERENCE,
  DEFAULT_LEAFLET_TILESIZE,
} from "./cesiumHelpers";

describe("cesiumHelpers", () => {
  test("getMercatorScaleFactorAtLatitude", () => {
    const maxScale = getMercatorScaleFactorAtLatitude(
      WEB_MERCATOR_MAX_LATITUDE_RAD,
    );

    expect(getMercatorScaleFactorAtLatitude(0)).toBeCloseTo(1);
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 4)).toBeCloseTo(
      Math.SQRT2,
    );
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 3)).toBeCloseTo(2);
    expect(getMercatorScaleFactorAtLatitude(-Math.PI / 4)).toBeCloseTo(
      Math.SQRT2,
    );
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 2)).toBe(maxScale);
  });

  test("getZoomFromPixelResolutionAtLatitude", () => {
    const meterResolution = EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE;
    const latitude = 0;
    const expectedZoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getZoomFromPixelResolutionAtLatitude", () => {
    const meterResolution = EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE;
    const latitude = Math.PI / 3; // at 60 deg
    const expectedZoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    expect(expectedZoom).toBeCloseTo(-1);
  });

  test("getZoomFromPixelResolutionAtLatitude", () => {
    const meterResolution =
      EARTH_CIRCUMFERENCE / (DEFAULT_LEAFLET_TILESIZE * 2); // compensate for mercater scale factor
    const latitude = Math.PI / 3; // at 60 deg
    const expectedZoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getPixelResolutionFromZoomAtLatitude", () => {
    const zoom = 0;
    const latitude = 0;
    const expectedResolution = getPixelResolutionFromZoomAtLatitude(
      zoom,
      latitude,
    );
    expect(expectedResolution).toBeCloseTo(
      EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE,
    );
  });

  test("round trip from zoom to resolution", () => {
    const zoom = 4;
    const latitude = 0;
    const resolution = getPixelResolutionFromZoomAtLatitude(zoom, latitude);
    const roundTripZoom = getZoomFromPixelResolutionAtLatitude(
      resolution,
      latitude,
    );
    expect(roundTripZoom).toBeCloseTo(zoom);
  });

  test("round trip from resolution to zoom", () => {
    const meterResolution = 1000;
    const latitude = 0;
    const zoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitude(
      zoom,
      latitude,
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });

  test("round trip from resolution to zoom", () => {
    const meterResolution = 1000;
    const latitude = Math.PI / 3;
    const zoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitude(
      zoom,
      latitude,
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });

  test("round trip from resolution to zoom", () => {
    const meterResolution = 1000;
    const latitude = Math.PI / 2 - 0.01; // out of mercator bounds
    const zoom = getZoomFromPixelResolutionAtLatitude(
      meterResolution,
      latitude,
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitude(
      zoom,
      latitude,
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });
});
