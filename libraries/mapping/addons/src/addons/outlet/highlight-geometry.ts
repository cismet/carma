import type { Map as LibreMap } from "maplibre-gl";

import {
  groundToMercator,
  mercatorToLngLat,
  type Bounds3857,
  type HighlightSpot,
} from "@carma-mapping/show-remote";

/** a spot where the map shows it, in css pixels */
export type DrawnSpot = { x: number; y: number; radius: number };

/** a rectangle where the map shows it, in css pixels */
export type DrawnFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Where a highlight is on screen. The radius is measured on the map, east of
 * the middle, so it follows the zoom the scene flies to; the view is north up
 * and flat, so east is as good as any other direction.
 */
export const projectHighlight = (
  map: Pick<LibreMap, "project">,
  spot: Pick<HighlightSpot, "center" | "radiusMeters">
): DrawnSpot => {
  const [x, y] = spot.center;
  const middle = map.project(mercatorToLngLat([x, y]));
  const edge = map.project(
    mercatorToLngLat([x + groundToMercator(spot.radiusMeters, spot.center), y])
  );
  return {
    x: middle.x,
    y: middle.y,
    radius: Math.max(Math.hypot(edge.x - middle.x, edge.y - middle.y), 1),
  };
};

/**
 * Where a rectangle is on screen, e.g. the area another screen shows. The
 * view is north up and flat, so two corners are enough.
 */
export const projectFrame = (
  map: Pick<LibreMap, "project">,
  [minX, minY, maxX, maxY]: Bounds3857
): DrawnFrame => {
  const topLeft = map.project(mercatorToLngLat([minX, maxY]));
  const bottomRight = map.project(mercatorToLngLat([maxX, minY]));
  return {
    x: Math.min(topLeft.x, bottomRight.x),
    y: Math.min(topLeft.y, bottomRight.y),
    width: Math.abs(bottomRight.x - topLeft.x),
    height: Math.abs(bottomRight.y - topLeft.y),
  };
};
