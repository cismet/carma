import type { Map as MaplibreMap } from "maplibre-gl";
import { LngLatBounds } from "maplibre-gl";
import type { Vector3 } from "three";
import {
  ecefDistance,
  geographicCoordinateFromEcef,
} from "@carma-mapping/annotations/core";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma-geo/proj";
import { degToRadNumeric, type Meters, type Radians } from "@carma-units";
import type { AnnotationFlyToOptions } from "@carma-mapping/annotations/runtime";

/**
 * MapLibre counterpart of the Cesium `flyToBoundingSphereExtent`: frame the
 * annotation points with the configured padding, keep bearing and pitch,
 * never zoom in past the minimum radius around a single point.
 */

export const MAPLIBRE_FLY_TO_DEFAULTS = Object.freeze({
  durationMs: 1_000,
  maxZoom: 21,
});

const resolveZoomForRadius = (
  map: MaplibreMap,
  radiusMeters: number,
  latitudeDeg: number,
  paddingFactor: number
): number => {
  const canvas = map.getCanvas();
  const viewportPx = Math.max(
    1,
    Math.min(canvas.clientWidth, canvas.clientHeight)
  );
  const metersPerPixel = ((2 * radiusMeters * paddingFactor) /
    viewportPx) as Meters;
  return Math.min(
    MAPLIBRE_FLY_TO_DEFAULTS.maxZoom,
    getZoomFromPixelResolutionAtLatitudeRad(
      metersPerPixel,
      degToRadNumeric(latitudeDeg) as Radians
    )
  );
};

export const flyMapLibreToPoints = (
  map: MaplibreMap,
  pointsECEF: readonly Vector3[],
  options: AnnotationFlyToOptions
): void => {
  if (pointsECEF.length === 0) return;
  const coordinates = pointsECEF.map((point) =>
    geographicCoordinateFromEcef(point)
  );
  const centerECEF = pointsECEF
    .reduce((sum, point) => sum.add(point), pointsECEF[0]!.clone().set(0, 0, 0))
    .divideScalar(pointsECEF.length);
  const radiusMeters = Math.max(
    options.minRadiusMeters,
    ...pointsECEF.map((point) => ecefDistance(point, centerECEF))
  );
  const center = geographicCoordinateFromEcef(centerECEF);
  const bounds = coordinates.reduce(
    (accumulated, coordinate) =>
      accumulated.extend([coordinate.longitude, coordinate.latitude]),
    new LngLatBounds(
      [coordinates[0]!.longitude, coordinates[0]!.latitude],
      [coordinates[0]!.longitude, coordinates[0]!.latitude]
    )
  );
  const zoom = resolveZoomForRadius(
    map,
    radiusMeters,
    center.latitude,
    options.paddingFactor
  );
  const spansArea =
    bounds.getNorthEast().lng !== bounds.getSouthWest().lng ||
    bounds.getNorthEast().lat !== bounds.getSouthWest().lat;
  if (spansArea && radiusMeters > options.minRadiusMeters) {
    const canvas = map.getCanvas();
    const padding = Math.round(
      (Math.min(canvas.clientWidth, canvas.clientHeight) *
        (1 - 1 / options.paddingFactor)) /
        2
    );
    map.fitBounds(bounds, {
      padding,
      maxZoom: MAPLIBRE_FLY_TO_DEFAULTS.maxZoom,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      duration: MAPLIBRE_FLY_TO_DEFAULTS.durationMs,
    });
    return;
  }
  map.flyTo({
    center: [center.longitude, center.latitude],
    zoom,
    bearing: map.getBearing(),
    pitch: map.getPitch(),
    duration: MAPLIBRE_FLY_TO_DEFAULTS.durationMs,
  });
};
