import { Easing } from "@carma-commons/math";
import type { Map as MaplibreMap } from "maplibre-gl";

/**
 * The bits of MapLibre camera geometry the viewer needs and the library does
 * not expose: how far the camera is from the centre in metres, which zoom
 * puts it at a given distance, and how the zoom has to move when the field
 * of view changes so the camera stays where it is.
 */

/** MapLibre's own earth radius (`earthRadius` in geo/lng_lat.ts) */
const EARTH_RADIUS_M = 6371008.8;
const EARTH_CIRCUMFERENCE_M = 2 * Math.PI * EARTH_RADIUS_M;
/** MapLibre's world is `tileSize * 2^zoom` pixels wide */
const TILE_SIZE = 512;

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;
export const radToDeg = (radians: number): number => (radians * 180) / Math.PI;

/** how many mercator world units one metre is at a latitude */
const mercatorUnitsPerMeter = (latitudeDeg: number): number =>
  1 / (EARTH_CIRCUMFERENCE_M * Math.cos(degToRad(latitudeDeg)));

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
  const distanceMerc = distanceM * mercatorUnitsPerMeter(latitudeDeg);
  return Math.log2(distancePx / (TILE_SIZE * distanceMerc));
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
  zoom + Math.log2(Math.tan(degToRad(fovDeg) / 2) / Math.tan(degToRad(nextFovDeg) / 2));

/** the camera's distance from the centre in metres, from the current view */
export const cameraDistanceM = (map: MaplibreMap): number => {
  const distancePx = readCameraToCenterDistancePx(map);
  const latitudeDeg = map.getCenter().lat;
  const zoom = map.getZoom();
  const metersPerPx =
    1 / (TILE_SIZE * Math.pow(2, zoom) * mercatorUnitsPerMeter(latitudeDeg));
  return distancePx * metersPerPx;
};

const MAX_FLY_DURATION_MS = 2000;
/** about a frame, so no code path ever sees a zero duration */
const MIN_FLY_DURATION_MS = 50;
const DYNAMIC_DISTANCE_TO_MS_FACTOR = 100;

/** a flight's duration from how far it goes: the square root of the metres */
export const dynamicDurationMs = (
  distanceM: number,
  maxDurationMs = MAX_FLY_DURATION_MS
): number =>
  clamp(
    Math.sqrt(Math.abs(distanceM)) * DYNAMIC_DISTANCE_TO_MS_FACTOR,
    MIN_FLY_DURATION_MS,
    maxDurationMs
  );

/** great-circle-free planar distance in metres between two lng/lat points */
export const groundDistanceM = (
  a: { lng: number; lat: number },
  b: { lng: number; lat: number }
): number => {
  const meanLat = degToRad((a.lat + b.lat) / 2);
  const dx = degToRad(b.lng - a.lng) * EARTH_RADIUS_M * Math.cos(meanLat);
  const dy = degToRad(b.lat - a.lat) * EARTH_RADIUS_M;
  return Math.hypot(dx, dy);
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
