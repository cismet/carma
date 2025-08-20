// mercator.spec.ts
import {
  getMercatorScaleFactorAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  getPixelResolutionFromZoomAtLatitudeRad,
} from "./mercator";
import {
  EARTH_CIRCUMFERENCE,
  DEFAULT_LEAFLET_TILESIZE,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "./constants";
import { asRadians, asMeters } from "./units";

describe("commons/utils mercator", () => {
  test("getMercatorScaleFactorAtLatitudeRad", () => {
    const maxScale = getMercatorScaleFactorAtLatitudeRad(
      asRadians(WEB_MERCATOR_MAX_LATITUDE_RAD)
    );

    expect(getMercatorScaleFactorAtLatitudeRad(asRadians(0))).toBeCloseTo(1);
    expect(
      getMercatorScaleFactorAtLatitudeRad(asRadians(Math.PI / 4))
    ).toBeCloseTo(Math.SQRT2);
    expect(
      getMercatorScaleFactorAtLatitudeRad(asRadians(Math.PI / 3))
    ).toBeCloseTo(2);
    expect(
      getMercatorScaleFactorAtLatitudeRad(asRadians(-Math.PI / 4))
    ).toBeCloseTo(Math.SQRT2);
    expect(getMercatorScaleFactorAtLatitudeRad(asRadians(Math.PI / 2))).toBe(
      maxScale
    );
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - eq zoom 0", () => {
    const meterResolution = asMeters(
      EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE
    );
    const latitude = asRadians(0);
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - high lat eq zoom -1", () => {
    const meterResolution = asMeters(
      EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE
    );
    const latitude = asRadians(Math.PI / 3); // 60°
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(-1);
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - compensate scale", () => {
    const meterResolution = asMeters(
      EARTH_CIRCUMFERENCE / (DEFAULT_LEAFLET_TILESIZE * 2)
    );
    const latitude = asRadians(Math.PI / 3); // 60°
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getPixelResolutionFromZoomAtLatitudeRad", () => {
    const zoom = 0;
    const latitude = asRadians(0);
    const expectedResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitude
    );
    expect(expectedResolution).toBeCloseTo(
      EARTH_CIRCUMFERENCE / DEFAULT_LEAFLET_TILESIZE
    );
  });

  test("round trip from zoom to resolution", () => {
    const zoom = 4;
    const latitude = asRadians(0);
    const resolution = getPixelResolutionFromZoomAtLatitudeRad(zoom, latitude);
    const roundTripZoom = getZoomFromPixelResolutionAtLatitudeRad(
      resolution,
      latitude
    );
    expect(roundTripZoom).toBeCloseTo(zoom);
  });

  test("round trip from resolution to zoom - eq", () => {
    const meterResolution = asMeters(1000);
    const latitude = asRadians(0);
    const zoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitude
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });

  test("round trip from resolution to zoom - high lat", () => {
    const meterResolution = asMeters(1000);
    const latitude = asRadians(Math.PI / 3);
    const zoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitude
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });

  test("round trip from resolution to zoom - near pole", () => {
    const meterResolution = asMeters(1000);
    const latitude = asRadians(Math.PI / 2 - 0.01); // just within mercator bounds
    const zoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    const roundTripResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitude
    );
    expect(roundTripResolution).toBeCloseTo(meterResolution);
  });
});
