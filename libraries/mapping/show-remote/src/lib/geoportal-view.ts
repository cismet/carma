import { isBounds3857, type Bounds3857 } from "./bounds";
import {
  DEFAULT_HIGHLIGHT_DIM,
  HIGHLIGHT_RADIUS_RANGE_METERS,
  isHighlightSpot,
  lngLatToMercator,
  mercatorToLngLat,
  type HighlightSpot,
} from "./highlights";
import { SHARED_TARGET } from "./relay-document";

/**
 * What a geoportal following the show tells the other screens, in its own
 * writer session (`<CODE>-G`, see `RELAY_WRITERS`): where it looks and what it
 * selected. Written under `"*"`, so the outlet and any later screen (a legend,
 * an info box) read the same events.
 */

/** a selected feature: lit on the model as a spot, named for the screens that show it */
export type GeoportalSelection = {
  /** round and soft, around the feature's extent, see `spotAround` */
  spot: HighlightSpot;
  /** which feature, and what the geoportal's info box shows of it */
  feature: {
    /** the geoportal layer it was picked on */
    layerId?: string;
    featureId?: string | number;
    properties: Record<string, string>;
  };
};

export type GeoportalView = {
  /**
   * The rectangle the geoportal shows, EPSG:3857. Null while it still sits
   * where the scene put it: then there is nothing to point out on the model.
   */
  frame: Bounds3857 | null;
  selection: GeoportalSelection | null;
};

const NO_VIEW: GeoportalView = { frame: null, selection: null };

const [MIN_RADIUS_METERS, MAX_RADIUS_METERS] = HIGHLIGHT_RADIUS_RANGE_METERS;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLngLat = (value: unknown): value is readonly [number, number] =>
  Array.isArray(value) &&
  value.length >= 2 &&
  typeof value[0] === "number" &&
  typeof value[1] === "number" &&
  Math.abs(value[0]) <= 180 &&
  Math.abs(value[1]) <= 90;

/** every position of a GeoJSON coordinates array, at whatever depth */
const positionsOf = (coordinates: unknown): (readonly [number, number])[] => {
  if (isLngLat(coordinates)) {
    return [coordinates];
  }
  return Array.isArray(coordinates) ? coordinates.flatMap(positionsOf) : [];
};

const geometryPositions = (
  geometry: unknown
): (readonly [number, number])[] => {
  if (!isRecord(geometry)) {
    return [];
  }
  if (geometry["type"] === "GeometryCollection") {
    return Array.isArray(geometry["geometries"])
      ? geometry["geometries"].flatMap(geometryPositions)
      : [];
  }
  return positionsOf(geometry["coordinates"]);
};

/**
 * The EPSG:3857 extent of a GeoJSON geometry in longitude and latitude, as
 * MapLibre hands out picked features. None without positions, and none for
 * coordinates outside longitude and latitude (a projected WMS answer), which
 * would otherwise land somewhere off the globe.
 */
export const extentOfGeometry = (geometry: unknown): Bounds3857 | null => {
  const positions = geometryPositions(geometry);
  if (positions.length === 0) {
    return null;
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const position of positions) {
    const [x, y] = lngLatToMercator(position);
    xs.push(x);
    ys.push(y);
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

/**
 * The spot a selection lights on the model: on the middle of its extent,
 * reaching half the extent's diagonal on the ground, kept within the sizes the
 * spot layer offers, so a point still shows and a district does not light the
 * whole model.
 */
export const spotAround = (extent: Bounds3857, id: string): HighlightSpot => {
  const [minX, minY, maxX, maxY] = extent;
  const center: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const [, lat] = mercatorToLngLat(center);
  const halfDiagonal = Math.hypot(maxX - minX, maxY - minY) / 2;
  const groundMeters = halfDiagonal * Math.cos((lat * Math.PI) / 180);
  return {
    id,
    center,
    radiusMeters: Math.min(
      MAX_RADIUS_METERS,
      Math.max(MIN_RADIUS_METERS, groundMeters)
    ),
    dim: DEFAULT_HIGHLIGHT_DIM,
  };
};

/** the whole document of the geoportal's session */
export const geoportalViewDocument = (
  view: GeoportalView
): Record<string, unknown> => ({ [SHARED_TARGET]: view });

const stringProperties = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
    : {};

const selectionOf = (value: unknown): GeoportalSelection | null => {
  if (!isRecord(value) || !isHighlightSpot(value["spot"])) {
    return null;
  }
  const feature = isRecord(value["feature"]) ? value["feature"] : {};
  const layerId = feature["layerId"];
  const featureId = feature["featureId"];
  return {
    spot: value["spot"],
    feature: {
      ...(typeof layerId === "string" ? { layerId } : {}),
      ...(typeof featureId === "string" || typeof featureId === "number"
        ? { featureId }
        : {}),
      properties: stringProperties(feature["properties"]),
    },
  };
};

/**
 * The geoportal's view in a resolved document (`resolveTargets`). Lenient: a
 * broken part reads as none and leaves the other, since the screens reading
 * it may be older or newer than the geoportal that wrote it.
 */
export const geoportalViewOf = (state: unknown): GeoportalView => {
  if (!isRecord(state)) {
    return NO_VIEW;
  }
  return {
    frame: isBounds3857(state["frame"]) ? state["frame"] : null,
    selection: selectionOf(state["selection"]),
  };
};
