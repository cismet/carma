import { difference, featureCollection, polygon } from "@turf/turf";

import {
  HIGHLIGHT_RADIUS_RANGE_METERS,
  groundToMercator,
  highlightRing,
  mercatorToLngLat,
} from "@carma-mapping/show-remote";

import { clampDim, type Spot } from "./spot-layer";

/**
 * The parts of the spot layer that need no map: what it draws, which spot a
 * point is in, and how far a turn of the wheel changes a spot or the dimming.
 */

/** outer ring of the cover; Web Mercator ends short of the poles */
const WORLD_RING: [number, number][] = [
  [-180, -85],
  [180, -85],
  [180, 85],
  [-180, 85],
  [-180, -85],
];

/**
 * A wheel reports pixels, lines or pages; one notch of a mouse wheel is about
 * 100 pixels, a trackpad sends many small steps.
 */
const LINE_PX = 16;
const PAGE_PX = 800;
/** one notch makes a spot about 15 % larger or smaller */
const RADIUS_LOG_PER_PX = Math.log(1.15) / 100;
/** one notch changes the dimming by 5 points */
const DIM_PER_PX = 0.05 / 100;

/**
 * The world with every spot cut out. Not one hole per spot: holes that
 * overlap make an invalid polygon, which the map draws as wedges. Cut out one
 * by one, overlapping spots leave their union bright, and a patch the spots
 * enclose stays dark, the same as on the display.
 */
const coverGeometry = (
  rings: readonly [number, number][][]
): GeoJSON.Polygon | GeoJSON.MultiPolygon | undefined =>
  difference(
    featureCollection([
      polygon([WORLD_RING]),
      ...rings.map((ring) => polygon([ring])),
    ])
  )?.geometry;

/**
 * The layer as GeoJSON: one cover with the spots cut out, as dark as the
 * layer says, and an outline and a middle for each spot.
 */
export const spotPreviewFeatures = (
  spots: readonly Spot[],
  dim: number
): GeoJSON.FeatureCollection => {
  const rings = spots.map((spot) => highlightRing(spot));
  const cover = spots.length > 0 ? coverGeometry(rings) : undefined;
  return {
    type: "FeatureCollection",
    features: [
      ...(cover
        ? [
            {
              type: "Feature" as const,
              properties: { kind: "cover", dim },
              geometry: cover,
            },
          ]
        : []),
      ...spots.map((spot, index) => ({
        type: "Feature" as const,
        properties: { kind: "ring", id: spot.id },
        geometry: { type: "LineString" as const, coordinates: rings[index] },
      })),
      ...spots.map((spot) => ({
        type: "Feature" as const,
        properties: { kind: "middle", id: spot.id },
        geometry: {
          type: "Point" as const,
          coordinates: mercatorToLngLat(spot.center),
        },
      })),
    ],
  };
};

/**
 * The spot a point (EPSG:3857) is in. Where spots overlap, the one drawn last
 * wins, since it is the one on top.
 */
export const spotAt = (
  spots: readonly Spot[],
  point: readonly [number, number]
): Spot | undefined => {
  for (let index = spots.length - 1; index >= 0; index--) {
    const spot = spots[index];
    const radius = groundToMercator(spot.radiusMeters, spot.center);
    const dx = point[0] - spot.center[0];
    const dy = point[1] - spot.center[1];
    if (dx * dx + dy * dy <= radius * radius) {
      return spot;
    }
  }
  return undefined;
};

/** a wheel event's turn in pixels; negative is away from the user */
export const wheelPixels = (deltaY: number, deltaMode: number): number =>
  deltaMode === 1
    ? deltaY * LINE_PX
    : deltaMode === 2
    ? deltaY * PAGE_PX
    : deltaY;

export const clampRadius = (radiusMeters: number): number =>
  Math.min(
    HIGHLIGHT_RADIUS_RANGE_METERS[1],
    Math.max(HIGHLIGHT_RADIUS_RANGE_METERS[0], radiusMeters)
  );

/** turning away from the user makes the spot larger, like zooming in */
export const wheeledRadius = (radiusMeters: number, pixels: number): number =>
  clampRadius(radiusMeters * Math.exp(-pixels * RADIUS_LOG_PER_PX));

/** turning away from the user makes the rest darker */
export const wheeledDim = (dim: number, pixels: number): number =>
  clampDim(dim - pixels * DIM_PER_PX);

/** the next free "Punkt n" */
export const nextSpotTitle = (spots: readonly Spot[]): string => {
  const taken = new Set(spots.map(({ title }) => title));
  let number = spots.length + 1;
  while (taken.has(`Punkt ${number}`)) {
    number++;
  }
  return `Punkt ${number}`;
};
