import maplibregl, { type Map as MaplibreMap } from "maplibre-gl";

import type { SelectedFeatureIdentifier } from "@carma-mapping/contexts";
import { targetClick } from "@carma-mapping/engines/maplibre";

/**
 * Picking a hit, the way the map itself would.
 *
 * Selecting a feature through `MapSelectionContext` highlights it and no more.
 * The info box is the host app's, and every host builds it off its own click
 * handling: the geoportal runs `onSelectionChanged` on the hits of a click and
 * queries its WMS layers at the clicked position. None of that can be reached
 * by naming a feature, so a row is picked by clicking the feature where it is
 * drawn, and the host answers as it does for any other click: the right info
 * box, for the right layer, with everything under the pointer in it.
 *
 * That is why the click is not fired blind at the middle of the hit's bounding
 * box. A hit that is not on screen (the user zoomed in on the way there) is
 * brought onto it first: the caller fits `pickBounds` and clicks again.
 * The middle of a bent street or a doughnut is not on it, and a symbol
 * sits above its own coordinate, so the point is searched for: a small ring
 * around the middle, and the click goes to the first point at which the map
 * draws this feature on top of everything else there, because the topmost hit
 * of a click is the one a host shows its info box for. A point where it is
 * drawn but covered will do when there is no better one: the click names the
 * hit (`targetClick`), so the engine hands it to the host first even where
 * other icons are stacked on top of it, as they are at low zoom. When there is
 * no such point at all the hit is not on screen
 * (the user panned away, the layer is off) and there is nothing to click, so
 * the caller falls back to selecting it and leaves the info box alone.
 *
 * The same helper serves both ways of picking, a row and its route, so the two
 * cannot end up meaning different things.
 */

/** a ranked hit, with what it takes to find it on screen */
export type PickableHit = SelectedFeatureIdentifier & {
  id: string | number;
  /** `[west, south, east, north]` in WGS84, from the feature index */
  bbox: [number, number, number, number];
};

/**
 * Where the click is tried, in pixels around the middle of the hit: the middle
 * itself first, then two rings, which is enough to land on a line, an outline
 * or a symbol that does not cover its own centre.
 */
const RING_RADII = [7, 14];
const RING_DIRECTIONS = 8;
const CLICK_POINTS: Array<[number, number]> = [
  [0, 0],
  ...RING_RADII.flatMap((radius) =>
    Array.from({ length: RING_DIRECTIONS }, (_, step): [number, number] => {
      const angle = (step / RING_DIRECTIONS) * 2 * Math.PI;
      return [
        Math.round(Math.cos(angle) * radius),
        Math.round(Math.sin(angle) * radius),
      ];
    })
  ),
];

const isSameFeature = (
  hit: { source: string; sourceLayer?: string; id?: string | number },
  target: PickableHit
) =>
  hit.source === target.source &&
  String(hit.id) === String(target.id) &&
  (!target.sourceLayer || hit.sourceLayer === target.sourceLayer);

/**
 * What the host counts as hit by a click: the topmost of these is what it shows
 * an info box for, so a point where our feature is that one is worth more than
 * a point where it is merely somewhere in the pile. Overlays that are drawn but
 * never selected are skipped the way the engine skips them, the route lines
 * among them.
 */
const isSelectable = (hit: { layer?: { metadata?: unknown } }) => {
  const carmaConf = (hit.layer?.metadata as Record<string, unknown> | undefined)
    ?.carmaConf as { nonSelectable?: boolean } | undefined;
  return !carmaConf?.nonSelectable;
};

/**
 * What to show so a hit can be clicked: the hit, the origin and the route
 * between them, `[west, south, east, north]` in WGS84. The route is grown
 * point by point, a line is too long to spread into `Math.min`.
 */
export const pickBounds = (
  hit: PickableHit,
  origin: { lat: number; lng: number } | null,
  route: [number, number][] = []
): [number, number, number, number] => {
  let [west, south, east, north] = hit.bbox;
  const points: [number, number][] = origin
    ? [[origin.lng, origin.lat], ...route]
    : route;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  return [west, south, east, north];
};

/**
 * Click the hit where the map draws it, so the host app answers with the info
 * box it shows for any other click. `false` when it is not drawn anywhere near
 * where it should be, and nothing was fired.
 */
export const clickHit = (map: MaplibreMap, hit: PickableHit): boolean => {
  const center = map.project([
    (hit.bbox[0] + hit.bbox[2]) / 2,
    (hit.bbox[1] + hit.bbox[3]) / 2,
  ]);
  const canvas = map.getCanvas();
  /** a point where the hit is drawn, but under something else; the second best */
  let buried: maplibregl.Point | null = null;

  const fire = (point: maplibregl.Point) => {
    // the map's own handlers read modifier keys off this; a click that
    // carries none is a plain click, which is what this is
    const originalEvent = new MouseEvent("click");
    // and it is a click for this hit, whatever else is drawn at that point
    targetClick(originalEvent, hit);
    map.fire("click", {
      lngLat: map.unproject(point),
      point,
      originalEvent,
    });
  };

  for (const [dx, dy] of CLICK_POINTS) {
    const point = new maplibregl.Point(center.x + dx, center.y + dy);
    if (
      point.x < 0 ||
      point.y < 0 ||
      point.x > canvas.clientWidth ||
      point.y > canvas.clientHeight
    ) {
      continue;
    }
    let drawnHere: ReturnType<typeof map.queryRenderedFeatures> = [];
    try {
      drawnHere = map.queryRenderedFeatures(point);
    } catch {
      // the style changed under the query; the next point tries again
      continue;
    }
    const selectable = drawnHere.filter(isSelectable);
    if (!selectable.some((drawn) => isSameFeature(drawn, hit))) {
      continue;
    }
    // the host shows the info box of the topmost hit, so a point where this
    // feature is that one is the point to click
    if (isSameFeature(selectable[0], hit)) {
      fire(point);
      return true;
    }
    buried = buried ?? point;
  }

  // nowhere on top, but drawn: click it there anyway. The click names the hit,
  // so the host answers for it rather than for whatever covers it
  if (buried) {
    fire(buried);
    return true;
  }

  console.debug("[NEAREST FEATURE] hit is not drawn, no click fired", hit);
  return false;
};
