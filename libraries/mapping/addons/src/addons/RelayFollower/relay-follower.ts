import {
  boundsKey,
  extentOfGeometry,
  isBounds3857,
  lngLatToMercator,
  mercatorToLngLat,
  spotAround,
  type Bounds3857,
  type GeoportalSelection,
  type GeoportalView,
} from "@carma-mapping/show-remote";
import type { Positions } from "@carma-mapping/map-controls-layout";

export type RelayFollowerConfig = {
  /**
   * The model the projector plays on, EPSG:3857 `[minX, minY, maxX, maxY]`:
   * where the geoportal flies for a scene without a position of its own,
   * which is every scene of a show made for one model. Without it, such a
   * scene leaves the map where it is.
   */
  modelBounds3857?: Bounds3857;
  /** how long the flight to a scene takes (default 2000); 0 jumps */
  flyDurationMs?: number;
  /** where "Zurück zur Modellansicht" sits in the control column */
  controlPosition?: Positions;
  controlOrder?: number;
};

/** the latitude Web Mercator ends at, so a world view still makes a frame */
const MAX_MERCATOR_LAT = 85.051129;

/** the info box texts a selection carries for the screens that show it */
const SELECTION_PROPERTIES = [
  "header",
  "title",
  "subtitle",
  "additionalInfo",
  "email",
  "tel",
  "url",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** where the presenter's scene puts the map, which is where the geoportal flies */
export const sceneBoundsOf = (
  state: Record<string, unknown> | null | undefined
): Bounds3857 | null => {
  const bounds = state?.["bounds"];
  return isBounds3857(bounds) ? bounds : null;
};

/** the scene the presenter shows, also when it brings no position */
export const sceneIdOf = (
  state: Record<string, unknown> | null | undefined
): string | null => {
  const scene = state?.["scene"];
  return typeof scene === "string" && scene !== "" ? scene : null;
};

/**
 * Where the geoportal goes for the presenter's scene, and where the button
 * brings it back to: the scene's position, else the model. None while no
 * show is running.
 */
export const homeOf = (
  state: Record<string, unknown> | null | undefined,
  modelBounds: Bounds3857 | null | undefined
): Bounds3857 | null => {
  if (!state) {
    return null;
  }
  return (
    sceneBoundsOf(state) ?? (isBounds3857(modelBounds) ? modelBounds : null)
  );
};

/** changes when the geoportal has to fly: a new scene or a new position */
export const flightKeyOf = (
  state: Record<string, unknown> | null | undefined,
  home: Bounds3857
): string => `${sceneIdOf(state) ?? ""}|${boundsKey(home)}`;

/**
 * The feature the geoportal's info box shows, from the host's store
 * (`features.selectedFeature`, `apps/geoportal/src/app/store/slices/features.ts`).
 */
export const selectedFeatureOf = (storeState: unknown): unknown => {
  const features = isRecord(storeState) ? storeState["features"] : undefined;
  return (isRecord(features) && features["selectedFeature"]) || null;
};

/**
 * A selection for the other screens, from an info box element: the picked
 * MapLibre feature's layer and id when it has one, else the element's own id.
 * None without a geometry in longitude and latitude, which leaves out the
 * "Position" a click on the bare map shows.
 */
export const selectionOfFeature = (
  info: unknown
): GeoportalSelection | null => {
  if (!isRecord(info)) {
    return null;
  }
  const source = isRecord(info["sourceFeature"]) ? info["sourceFeature"] : {};
  const extent = extentOfGeometry(info["geometry"] ?? source["geometry"]);
  if (!extent) {
    return null;
  }
  const metadata =
    isRecord(source["layer"]) && isRecord(source["layer"]["metadata"])
      ? source["layer"]["metadata"]
      : {};
  const layerId = metadata["layer-id"];
  const featureId = [source["id"], info["id"]].find(
    (id): id is string | number =>
      typeof id === "string" || typeof id === "number"
  );
  const properties = isRecord(info["properties"]) ? info["properties"] : {};
  return {
    spot: spotAround(
      extent,
      `${typeof layerId === "string" ? layerId : ""}:${featureId ?? ""}`
    ),
    feature: {
      ...(typeof layerId === "string" ? { layerId } : {}),
      ...(featureId !== undefined ? { featureId } : {}),
      properties: Object.fromEntries(
        SELECTION_PROPERTIES.flatMap((key) => {
          const value = properties[key];
          return typeof value === "string" ? [[key, value]] : [];
        })
      ),
    },
  };
};

/**
 * What the geoportal tells the other screens: its frame only once the user
 * moved it away from the scene's position, the selection always.
 */
export const followerView = (
  movedAway: boolean,
  frame: Bounds3857 | null,
  selection: GeoportalSelection | null
): GeoportalView => ({ frame: movedAway ? frame : null, selection });

/** a rectangle as the south-west and north-east corners `fitBounds` takes */
export const lngLatBoundsOf = ([minX, minY, maxX, maxY]: Bounds3857): [
  [number, number],
  [number, number]
] => [mercatorToLngLat([minX, minY]), mercatorToLngLat([maxX, maxY])];

const clamp = (value: number, limit: number): number =>
  Math.max(-limit, Math.min(limit, value));

/** the map's visible corners as an EPSG:3857 rectangle */
export const frameOfLngLat = (
  west: number,
  south: number,
  east: number,
  north: number
): Bounds3857 => {
  const [minX, minY] = lngLatToMercator([
    clamp(west, 180),
    clamp(south, MAX_MERCATOR_LAT),
  ]);
  const [maxX, maxY] = lngLatToMercator([
    clamp(east, 180),
    clamp(north, MAX_MERCATOR_LAT),
  ]);
  return [minX, minY, maxX, maxY];
};
