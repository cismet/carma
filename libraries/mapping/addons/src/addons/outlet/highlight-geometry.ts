import type { Map as LibreMap } from "maplibre-gl";

import {
  groundToMercator,
  mercatorToLngLat,
  type HighlightSpot,
} from "@carma-mapping/show-remote";

/** a spot where the map shows it, in css pixels */
export type DrawnSpot = { x: number; y: number; radius: number };

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
