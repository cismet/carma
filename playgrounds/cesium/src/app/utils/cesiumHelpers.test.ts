// cesiumHelpers.test.ts

import {
  getMercatorScaleFactorAtLatitude,
  getZoomFromElevation,
  getElevationFromZoom,
  EARTH_CIRCUMFERENCE,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from './cesiumHelpers';

describe('cesiumHelpers', () => {
  test('getMercatorScaleFactorAtLatitude', () => {
    const maxScale = getMercatorScaleFactorAtLatitude(
      WEB_MERCATOR_MAX_LATITUDE_RAD
    );

    expect(getMercatorScaleFactorAtLatitude(0)).toBeCloseTo(1);
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 4)).toBeCloseTo(
      Math.SQRT2
    );
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 3)).toBeCloseTo(2);
    expect(getMercatorScaleFactorAtLatitude(-Math.PI / 4)).toBeCloseTo(
      Math.SQRT2
    );
    expect(getMercatorScaleFactorAtLatitude(Math.PI / 2)).toBe(maxScale);
  });

  test('getZoomFromElevation', () => {
    const elevation = EARTH_CIRCUMFERENCE;
    const latitude = 0;
    const expectedZoom = 0;
    expect(getZoomFromElevation(elevation, latitude)).toBeCloseTo(expectedZoom);
  });

  test('getElevationFromZoom', () => {
    const zoom = 0;
    const latitude = 0;
    const expectedElevation = EARTH_CIRCUMFERENCE;
    expect(getElevationFromZoom(zoom, latitude)).toBeCloseTo(expectedElevation);
  });

  test('getElevationFromZoom', () => {
    const zoom = 4;
    const latitude = Math.PI / 3;
    const expectedElevation = EARTH_CIRCUMFERENCE / (16 * 2); // 2 ^ 4 * scale at 60 degrees
    expect(getElevationFromZoom(zoom, latitude)).toBeCloseTo(expectedElevation);
  });

  test('round trip', () => {
    const elevation = 1000;
    const latitude = 0;
    const zoom = getZoomFromElevation(elevation, latitude);
    const roundTripElevation = getElevationFromZoom(zoom, latitude);
    expect(roundTripElevation).toBeCloseTo(elevation);
  });
  test('round trip', () => {
    const elevation = 1000;
    const latitude = Math.PI / 3;
    const zoom = getZoomFromElevation(elevation, latitude);
    const roundTripElevation = getElevationFromZoom(zoom, latitude);
    expect(roundTripElevation).toBeCloseTo(elevation);
  });
});
