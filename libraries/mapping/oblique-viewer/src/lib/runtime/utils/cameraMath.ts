import { zoom512as256, zoom256as512 } from "@carma-mapping/engines/maplibre";
import { Easing, clamp } from "@carma-commons/math";
import { degToRadNumeric as degToRad } from "@carma-units";
import type { Meters, Radians } from "@carma-units";
import {
  DEFAULT_LEAFLET_TILESIZE,
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  getWebMercatorFromWgs84Deg,
  getMercatorScaleFactorAtLatitudeRad,
} from "@carma-geo/proj";
import type { Degrees } from "@carma-units";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * The bits of MapLibre camera geometry the viewer needs and the library does
 * not expose: how far the camera is from the centre in metres, which zoom
 * puts it at a given distance, and how the zoom has to move when the field
 * of view changes so the camera stays where it is.
 */

/** the camera's distance from the centre in CSS pixels, from height and fov */
export const cameraToCenterDistancePx = (
  heightPx: number,
  fovDeg: number
): number => (0.5 * heightPx) / Math.tan(degToRad(fovDeg) / 2);

/** what the transform reports as its camera-to-centre distance, CSS px */
export const readCameraToCenterDistancePx = (map: MaplibreMap): number =>
  map.transform.cameraToCenterDistance;

/**
 * The zoom at which the camera is `distanceM` metres from the map centre,
 * for a given field of view and latitude. Metres per pixel scale with
 * `2^zoom`, and the camera distance in pixels is fixed by the fov, so the
 * zoom follows from equating the two.
 */
export const zoomForCameraDistance = (
  distanceM: number,
  heightPx: number,
  fovDeg: number,
  latitudeDeg: number
): number => {
  const distancePx = cameraToCenterDistancePx(heightPx, fovDeg);
  return zoom256as512(
    getZoomFromPixelResolutionAtLatitudeRad(
      (distanceM / distancePx) as Meters,
      degToRad(latitudeDeg) as Radians,
      { tileSize: DEFAULT_LEAFLET_TILESIZE }
    )
  );
};

/**
 * The zoom that keeps the camera in place when the fov changes: narrowing
 * the fov pushes the camera back in pixels, so the map has to zoom in by the
 * same factor for the camera to stay put in metres.
 */
export const zoomKeepingCameraForFov = (
  zoom: number,
  fovDeg: number,
  nextFovDeg: number
): number =>
  zoom +
  Math.log2(
    Math.tan(degToRad(fovDeg) / 2) / Math.tan(degToRad(nextFovDeg) / 2)
  );

/** the camera's distance from the centre in metres, from the current view */
export const cameraDistanceM = (map: MaplibreMap): number => {
  const distancePx = readCameraToCenterDistancePx(map);
  const latitudeDeg = map.getCenter().lat;
  const zoom = map.getZoom();
  const metersPerPx = getPixelResolutionFromZoomAtLatitudeRad(
    zoom512as256(zoom),
    degToRad(latitudeDeg) as Radians,
    { tileSize: DEFAULT_LEAFLET_TILESIZE }
  );
  return distancePx * metersPerPx;
};

export const MAX_OBLIQUE_TRANSITION_MS = 500;
/** Bound camera actions while preserving explicit immediate moves. */
export const capObliqueAnimationDuration = (durationMs: number): number =>
  clamp(
    Number.isFinite(durationMs) ? durationMs : MAX_OBLIQUE_TRANSITION_MS,
    0,
    MAX_OBLIQUE_TRANSITION_MS
  );
/** about a frame, so no code path ever sees a zero duration */
const MIN_FLY_DURATION_MS = 50;
const DYNAMIC_DISTANCE_TO_MS_FACTOR = 35;

/** a flight's duration from how far it goes: the square root of the metres */
export const dynamicDurationMs = (
  distanceM: number,
  maxDurationMs = MAX_OBLIQUE_TRANSITION_MS
): number =>
  clamp(
    Math.sqrt(Math.abs(distanceM)) * DYNAMIC_DISTANCE_TO_MS_FACTOR,
    MIN_FLY_DURATION_MS,
    Math.max(MIN_FLY_DURATION_MS, capObliqueAnimationDuration(maxDurationMs))
  );

/** great-circle-free planar distance in metres between two lng/lat points */
export const groundDistanceM = (
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
): number => {
  const first = getWebMercatorFromWgs84Deg(a.lng as Degrees, a.lat as Degrees);
  const second = getWebMercatorFromWgs84Deg(b.lng as Degrees, b.lat as Degrees);
  const scale = getMercatorScaleFactorAtLatitudeRad(
    degToRad((a.lat + b.lat) * 0.5) as Radians
  );
  return Math.hypot(second[0] - first[0], second[1] - first[1]) / scale;
};

export type TweenHandle = { cancel: () => void };

/**
 * One value from `from` to `to` over `durationMs` on animation frames. The
 * update always runs once with the end value on completion.
 */
export const tween = ({
  from,
  to,
  durationMs,
  easing = Easing.LINEAR_NONE,
  delayMs = 0,
  onUpdate,
  onComplete,
}: {
  from: number;
  to: number;
  durationMs: number;
  easing?: (t: number) => number;
  delayMs?: number;
  onUpdate: (value: number) => void;
  onComplete?: () => void;
}): TweenHandle => {
  let frameId: number | null = null;
  let cancelled = false;
  const start = performance.now() + delayMs;
  const duration = Math.max(1, durationMs);

  const step = (now: number) => {
    if (cancelled) return;
    const progress = clamp((now - start) / duration, 0, 1);
    onUpdate(from + (to - from) * easing(progress));
    if (progress >= 1) {
      frameId = null;
      onComplete?.();
      return;
    }
    frameId = requestAnimationFrame(step);
  };

  frameId = requestAnimationFrame(step);
  return {
    cancel: () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = null;
    },
  };
};
