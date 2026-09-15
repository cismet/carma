import type { Map as MaplibreMap } from "maplibre-gl";

import type { SceneRect } from "./annotation-clip";
import type { AnnotationAnchor } from "./types";

/**
 * The one place that says what a scene coordinate means on the ground.
 *
 * Scene units are map pixels at the anchor's zoom, counted from the anchor.
 * That is a web mercator plane, so the conversion is arithmetic and needs no
 * camera: it holds while the map is rotated, tilted, or mid-gesture, which the
 * old `project`/`unproject` round trip did not.
 *
 * Everything that crosses between the drawing and the map goes through here —
 * the plane transform, the hit test, the picker probes, the window the clipped
 * copies are cut to, and zoom-to-drawing.
 */

/** maplibre's tile size, what `project` counts a zoom level in */
const TILE_SIZE = 512;

const worldSize = (zoom: number) => TILE_SIZE * 2 ** zoom;

const mercatorX = (lng: number) => (lng + 180) / 360;

const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

const lngOf = (x: number) => x * 360 - 180;

const latOf = (y: number) =>
  (2 * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - Math.PI / 2) *
  (180 / Math.PI);

export type ScenePoint = { x: number; y: number };

export const sceneToLngLat = (
  anchor: AnnotationAnchor,
  x: number,
  y: number
): { lng: number; lat: number } => {
  const size = worldSize(anchor.zoom);
  return {
    lng: lngOf(mercatorX(anchor.lng) + x / size),
    lat: latOf(mercatorY(anchor.lat) + y / size),
  };
};

export const lngLatToScene = (
  anchor: AnnotationAnchor,
  lng: number,
  lat: number
): ScenePoint => {
  const size = worldSize(anchor.zoom);
  return {
    x: (mercatorX(lng) - mercatorX(anchor.lng)) * size,
    y: (mercatorY(lat) - mercatorY(anchor.lat)) * size,
  };
};

/** the overlay's top left inside the map container, what `project` counts from */
export const overlayOffset = (
  map: MaplibreMap,
  overlay: HTMLElement
): ScenePoint => {
  const container = map.getContainer().getBoundingClientRect();
  const box = overlay.getBoundingClientRect();
  return { x: box.left - container.left, y: box.top - container.top };
};

/**
 * The plane's own box in scene units, for a camera at `scale`. That is what is
 * on screen while the map is north-up and flat, and what the drawing is drawn
 * into at every other camera, so it is the window the clipped copies are cut
 * to either way.
 */
export const planeSceneRect = (
  map: MaplibreMap | null,
  overlay: HTMLElement | null,
  anchor: AnnotationAnchor | null,
  scale: number
): SceneRect | null => {
  if (!map || !overlay || !anchor || !(scale > 0)) {
    return null;
  }
  const box = overlay.getBoundingClientRect();
  if (box.width === 0 || box.height === 0) {
    return null;
  }
  const offset = overlayOffset(map, overlay);
  const point = map.project([anchor.lng, anchor.lat]);
  const originX = point.x - offset.x;
  const originY = point.y - offset.y;
  return {
    minX: -originX / scale,
    minY: -originY / scale,
    maxX: (box.width - originX) / scale,
    maxY: (box.height - originY) / scale,
  };
};

/**
 * The ground between two lng/lats, in map pixels of `zoom`, north up: x east,
 * y south. The same arithmetic as `lngLatToScene`, asked without an anchor —
 * what the plane needs to know is how far the camera looks, not where the
 * drawing is.
 */
export const groundOffset = (
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
  zoom: number
): ScenePoint => {
  const size = worldSize(zoom);
  return {
    x: (mercatorX(to.lng) - mercatorX(from.lng)) * size,
    y: (mercatorY(to.lat) - mercatorY(from.lat)) * size,
  };
};
