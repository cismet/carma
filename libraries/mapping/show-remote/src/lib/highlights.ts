import { DEFAULT_POINTER_DIM } from "./pointer";

/**
 * Stored highlights: spots a scene keeps, drawn by the display like the
 * pointer's flashlight (everything dimmed, the spot left bright), but placed
 * on the map in pm-show instead of aimed from the phone. The remote shows one
 * button per highlight of the live scene; each switches its spot on or off on
 * its own, so several can be lit together. A scene starts with all of them
 * off.
 *
 * A highlight is kept in map coordinates, not in model widths like a pointer
 * sample: it belongs to a place on the map, and the display finds that place
 * wherever the scene puts the view.
 */

export type ShowHighlight = {
  /** stable within the scene, so the remote can say which ones are on */
  id: string;
  /** the button's name on the remote */
  title: string;
  /** the middle of the spot, EPSG:3857 `[x, y]` */
  center: readonly [number, number];
  /** the spot's radius on the ground, in metres */
  radiusMeters: number;
  /** how dark everything outside the spot gets, 0 to 1 */
  dim: number;
};

/**
 * What the remote puts into the display's state document: the spots that are
 * on, in the scene's order. The display needs no title, and it never learns
 * which scene they belong to.
 */
export type HighlightSpot = Omit<ShowHighlight, "title">;

export const DEFAULT_HIGHLIGHT_RADIUS_METERS = 80;
export const DEFAULT_HIGHLIGHT_DIM = DEFAULT_POINTER_DIM;
/** the size slider in pm-show: a single building up to a quarter */
export const HIGHLIGHT_RADIUS_RANGE_METERS = [15, 400] as const;
/** the same range the pointer's "Abdunkeln" slider offers */
export const HIGHLIGHT_DIM_RANGE = [0.2, 0.95] as const;
/**
 * How far the soft edge reaches either side of the radius, as a share of it.
 * The pointer's spot uses the same, so a stored spot looks like a held one.
 */
export const HIGHLIGHT_EDGE_SOFTNESS = 0.2;

// EPSG:3857 validity, used only to reject nonsense before it reaches the map
const MAX_WEB_MERCATOR = 20048966.105;
const EARTH_RADIUS = 6378137;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isCenter = (value: unknown): value is readonly [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every(
    (part) => isFiniteNumber(part) && Math.abs(part) <= MAX_WEB_MERCATOR
  );

export const isHighlightSpot = (value: unknown): value is HighlightSpot =>
  isRecord(value) &&
  typeof value["id"] === "string" &&
  isCenter(value["center"]) &&
  isFiniteNumber(value["radiusMeters"]) &&
  value["radiusMeters"] > 0 &&
  isFiniteNumber(value["dim"]) &&
  value["dim"] >= 0 &&
  value["dim"] <= 1;

export const isShowHighlight = (value: unknown): value is ShowHighlight =>
  isHighlightSpot(value) &&
  typeof (value as Record<string, unknown>)["title"] === "string";

export const isHighlightSpots = (value: unknown): value is HighlightSpot[] =>
  Array.isArray(value) && value.every(isHighlightSpot);

/**
 * A scene's highlights that can be drawn. A broken entry is dropped rather
 * than failing the whole show, since the show is read long after it was
 * written and by older and newer remotes alike.
 */
export const sceneHighlights = (scene: {
  highlights?: unknown;
}): ShowHighlight[] =>
  Array.isArray(scene.highlights)
    ? scene.highlights.filter(isShowHighlight)
    : [];

/** the spots of the switched-on ids, in the scene's order */
export const highlightSpotsOf = (
  highlights: readonly ShowHighlight[],
  onIds: readonly string[]
): HighlightSpot[] =>
  highlights
    .filter(({ id }) => onIds.includes(id))
    .map(({ id, center, radiusMeters, dim }) => ({
      id,
      center,
      radiusMeters,
      dim,
    }));

/** EPSG:3857 metres to longitude and latitude */
export const mercatorToLngLat = ([x, y]: readonly [number, number]): [
  number,
  number
] => [
  (x / EARTH_RADIUS) * (180 / Math.PI),
  (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI),
];

/** longitude and latitude to EPSG:3857 metres */
export const lngLatToMercator = ([lng, lat]: readonly [number, number]): [
  number,
  number
] => [
  EARTH_RADIUS * ((lng * Math.PI) / 180),
  EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
];

/**
 * A ground distance in EPSG:3857 units at the spot. Web Mercator stretches
 * everything by 1 / cos(latitude), in Wuppertal by about 1.6, so a spot drawn
 * with its radius in map units would come out that much too small.
 */
export const groundToMercator = (
  meters: number,
  center: readonly [number, number]
): number => {
  const [, lat] = mercatorToLngLat(center);
  return meters / Math.cos((lat * Math.PI) / 180);
};

/**
 * The spot's outline as a closed ring of longitude and latitude, for drawing
 * it on a map as a polygon.
 */
export const highlightRing = (
  spot: Pick<HighlightSpot, "center" | "radiusMeters">,
  segments = 64
): [number, number][] => {
  const radius = groundToMercator(spot.radiusMeters, spot.center);
  const [cx, cy] = spot.center;
  const ring: [number, number][] = [];
  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2;
    ring.push(
      mercatorToLngLat([
        cx + radius * Math.cos(angle),
        cy + radius * Math.sin(angle),
      ])
    );
  }
  return ring;
};
