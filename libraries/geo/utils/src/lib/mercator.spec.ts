import { describe, expect, test } from "vitest";

import { PI } from "@carma-units";
import type { Degrees, Meters, Radians } from "@carma-units";

import {
  EARTH_CIRCUMFERENCE,
  WEB_MERCATOR_MAX_LATITUDE_RAD,
} from "@carma-geo/data-structures";
import {
  distanceFromMercatorZoomAtLatitudeDeg,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "./geo";
import {
  getMercatorScaleFactorAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  getPixelResolutionFromZoomAtLatitudeRad,
  getEquivalentZoomForConvention,
  getEquivalentZoomForTileSize,
  getEquivalentZoomRangeForConvention,
  getEquivalentZoomRangeForTileSize,
  WEB_MERCATOR_TILE_SIZE_256,
} from "./mercator";

const LARGER_WEB_MERCATOR_TILE_SIZE = 512;

describe("commons/utils mercator", () => {
  test("getMercatorScaleFactorAtLatitudeRad", () => {
    const maxScale = getMercatorScaleFactorAtLatitudeRad(
      WEB_MERCATOR_MAX_LATITUDE_RAD
    );

    expect(getMercatorScaleFactorAtLatitudeRad(0 as Radians)).toBeCloseTo(1);
    expect(
      getMercatorScaleFactorAtLatitudeRad((Math.PI / 4) as Radians)
    ).toBeCloseTo(Math.SQRT2);
    expect(
      getMercatorScaleFactorAtLatitudeRad((Math.PI / 3) as Radians)
    ).toBeCloseTo(2);
    expect(
      getMercatorScaleFactorAtLatitudeRad((-Math.PI / 4) as Radians)
    ).toBeCloseTo(Math.SQRT2);
    expect(getMercatorScaleFactorAtLatitudeRad((Math.PI / 2) as Radians)).toBe(
      maxScale
    );
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - eq zoom 0", () => {
    const meterResolution = (EARTH_CIRCUMFERENCE /
      WEB_MERCATOR_TILE_SIZE_256) as Meters;
    const latitude = 0 as Radians;
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - high lat eq zoom -1", () => {
    const meterResolution = (EARTH_CIRCUMFERENCE /
      WEB_MERCATOR_TILE_SIZE_256) as Meters;
    const latitude = (Math.PI / 3) as Radians; // 60°
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(-1);
  });

  test("getZoomFromPixelResolutionAtLatitudeRad - compensate scale", () => {
    const meterResolution = (EARTH_CIRCUMFERENCE /
      LARGER_WEB_MERCATOR_TILE_SIZE) as Meters;
    const latitude = (Math.PI / 3) as Radians; // 60°
    const expectedZoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );
    expect(expectedZoom).toBeCloseTo(0);
  });

  test("getPixelResolutionFromZoomAtLatitudeRad", () => {
    const zoom = 0;
    const latitude = 0 as Radians;
    const expectedResolution = getPixelResolutionFromZoomAtLatitudeRad(
      zoom,
      latitude
    );
    // At zoom 0, should be earth circumference / tile size
    const earthCircumferencePerTile =
      EARTH_CIRCUMFERENCE / WEB_MERCATOR_TILE_SIZE_256;
    expect(expectedResolution).toBeCloseTo(earthCircumferencePerTile, 0);
  });

  test("ABSOLUTE: zoom 0 at equator should be ~156543 m/px (Web Mercator standard)", () => {
    // Known correct value: at zoom 0, equator, one 256px tile covers Earth
    // Resolution = 40075017m / 256px ≈ 156543.03 m/px
    const zoom = 0;
    const latitude = 0 as Radians;
    const resolution = getPixelResolutionFromZoomAtLatitudeRad(zoom, latitude);

    // Standard Web Mercator value
    expect(resolution).toBeCloseTo(156543.03, 0);
  });

  test("ABSOLUTE: zoom 19 at equator should be ~0.298 m/px", () => {
    // At zoom 19: resolution = 156543.03 / 2^19 ≈ 0.2985 m/px
    const zoom = 19;
    const latitude = 0 as Radians;
    const resolution = getPixelResolutionFromZoomAtLatitudeRad(zoom, latitude);

    expect(resolution).toBeCloseTo(0.2985, 3);
  });

  test("ABSOLUTE: reverse - 0.3 m/px at equator should be ~zoom 19", () => {
    // Verify the inverse: if we have ~0.3 m/px, we should get zoom ~19
    const meterResolution = 0.3 as Meters;
    const latitude = 0 as Radians;
    const zoom = getZoomFromPixelResolutionAtLatitudeRad(
      meterResolution,
      latitude
    );

    expect(zoom).toBeCloseTo(19, 0);
  });

  test("round trip from zoom to resolution", () => {
    const zoom = 4;
    const latitude = 0 as Radians;
    const resolution = getPixelResolutionFromZoomAtLatitudeRad(zoom, latitude);
    const roundTripZoom = getZoomFromPixelResolutionAtLatitudeRad(
      resolution,
      latitude
    );
    expect(roundTripZoom).toBeCloseTo(zoom);
  });

  test("converts equivalent zoom between 256px and 512px tile conventions", () => {
    const leafletZoom = 22;
    const maplibreZoom = getEquivalentZoomForTileSize(leafletZoom, {
      sourceTileSize: WEB_MERCATOR_TILE_SIZE_256,
      targetTileSize: LARGER_WEB_MERCATOR_TILE_SIZE,
    });

    expect(maplibreZoom).toBeCloseTo(21);

    const roundTripLeafletZoom = getEquivalentZoomForTileSize(maplibreZoom, {
      sourceTileSize: LARGER_WEB_MERCATOR_TILE_SIZE,
      targetTileSize: WEB_MERCATOR_TILE_SIZE_256,
    });

    expect(roundTripLeafletZoom).toBeCloseTo(leafletZoom);
  });

  test("converts equivalent zoom range between tile conventions", () => {
    const range = getEquivalentZoomRangeForTileSize(
      { zoomMin: 10, zoomMax: 22 },
      {
        sourceTileSize: WEB_MERCATOR_TILE_SIZE_256,
        targetTileSize: LARGER_WEB_MERCATOR_TILE_SIZE,
      }
    );

    expect(range.zoomMin).toBeCloseTo(9);
    expect(range.zoomMax).toBeCloseTo(21);
  });

  test("convention helpers default missing tile size to 256px", () => {
    const maplibreZoom = getEquivalentZoomForConvention(
      { zoom: 22 },
      { tileSize: LARGER_WEB_MERCATOR_TILE_SIZE }
    );

    expect(maplibreZoom).toBeCloseTo(21);
  });

  test("converts zoom ranges and annotates the target tile convention", () => {
    const range = getEquivalentZoomRangeForConvention(
      { zoomMin: 10, zoomMax: 22 },
      { tileSize: LARGER_WEB_MERCATOR_TILE_SIZE }
    );

    expect(range.tileSize).toBe(LARGER_WEB_MERCATOR_TILE_SIZE);
    expect(range.zoomMin).toBeCloseTo(9);
    expect(range.zoomMax).toBeCloseTo(21);
  });

  test("round trip from resolution to zoom - eq", () => {
    const meterResolution = 1000 as Meters;
    const latitude = 0 as Radians;
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
    const meterResolution = 1000 as Meters;
    const latitude = (Math.PI / 3) as Radians;
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
    const meterResolution = 1000 as Meters;
    const latitude = (PI / 2 - 0.01) as Radians; // just within mercator bounds
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

  test("round trip between mercator zoom and distance at latitude", () => {
    const zoom = 12.5;
    const latitudeDeg = 51.27 as Degrees;
    const distance = distanceFromMercatorZoomAtLatitudeDeg(zoom, latitudeDeg, {
      fovVerticalRad: ((60 * Math.PI) / 180) as Radians,
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(distance).not.toBeNull();

    const roundTripZoom = mercatorZoomFromDistanceAtLatitudeDeg(
      distance as Meters,
      latitudeDeg,
      {
        fovVerticalRad: ((60 * Math.PI) / 180) as Radians,
        viewportWidthPx: 1400,
        viewportHeightPx: 900,
      }
    );

    expect(roundTripZoom).toBeCloseTo(zoom, 6);
  });
});
