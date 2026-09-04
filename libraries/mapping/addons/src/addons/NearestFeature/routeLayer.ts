import maplibregl, {
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MaplibreMap,
} from "maplibre-gl";

import type { PickableHit } from "./pickHit";

/**
 * The routes of one ranking, drawn on the map.
 *
 * The ranking already drove to every hit to put them in order (see
 * `carRanking.ts`), so the lines are there and cost nothing more to show. They
 * are what makes the list readable: "twelve minutes" says little, the way
 * around the valley says it all.
 *
 * One route is the picked one and is drawn blue on top of the others, and which
 * one that is comes from the selection itself: a click on a line picks the hit
 * it leads to, exactly as picking that hit's row does, and both repaint from
 * `MapSelectionContext`. There is no second piece of state saying which route
 * is highlighted, so the list and the map cannot disagree.
 *
 * The lines are marked `nonSelectable`, so the map's own click handling walks
 * past them: a route is a picture of a hit, never a hit of its own.
 */

/** one hit's route, ready to draw and to pick */
export type NearestFeatureRoute = {
  /** the hit's `featureKey`, which is also what a selection is matched by */
  key: string;
  /** the hit the route leads to; a click on the line picks it */
  hit: PickableHit;
  /** the driven line, `[lng, lat]` in WGS84 */
  coordinates: [number, number][];
};

const SOURCE_ID = "carma-nearest-feature-routes";
const CASING_LAYER_ID = `${SOURCE_ID}-casing`;
const LINE_LAYER_ID = `${SOURCE_ID}-line`;
const SELECTED_LAYER_ID = `${SOURCE_ID}-selected`;
/** all of them, bottom first: the picked route is drawn over the rest */
const LAYER_IDS = [CASING_LAYER_ID, LINE_LAYER_ID, SELECTED_LAYER_ID];

/** the property a line carries, and what a click reads off it */
const KEY_PROPERTY = "routeKey";

const UNSELECTED_COLOR = "#6b7280";
const SELECTED_COLOR = "#3b82f6";
const CASING_COLOR = "#ffffff";

/**
 * Matches the picked route, and nothing at all while none is picked: no hit's
 * key is the empty string, so the empty one is the "none" of this filter.
 */
const routeFilter = (key: string | null): FilterSpecification => [
  "==",
  ["get", KEY_PROPERTY],
  key ?? "",
];

const featureCollection = (routes: NearestFeatureRoute[]) => ({
  type: "FeatureCollection" as const,
  features: routes
    .filter((route) => route.coordinates.length > 1)
    .map((route) => ({
      type: "Feature" as const,
      properties: { [KEY_PROPERTY]: route.key },
      geometry: {
        type: "LineString" as const,
        coordinates: route.coordinates,
      },
    })),
});

/** the map's click handling reads this and leaves the lines alone */
const NON_SELECTABLE = { carmaConf: { nonSelectable: true } };

/**
 * Draw the routes, or update the lines that are already drawn. Safe to call
 * again with the same routes, which is what a style rebuild needs: it drops the
 * source and the layers, and this puts them back.
 */
export const drawRoutes = (
  map: MaplibreMap,
  routes: NearestFeatureRoute[],
  selectedKey: string | null
) => {
  const data = featureCollection(routes);
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (source) {
    source.setData(data);
  } else {
    map.addSource(SOURCE_ID, { type: "geojson", data });
  }

  const shared = {
    source: SOURCE_ID,
    filter: ["==", ["geometry-type"], "LineString"] as FilterSpecification,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
    metadata: NON_SELECTABLE,
  };
  if (!map.getLayer(CASING_LAYER_ID)) {
    map.addLayer({
      ...shared,
      id: CASING_LAYER_ID,
      type: "line",
      paint: {
        "line-color": CASING_COLOR,
        "line-width": 8,
        "line-opacity": 0.7,
      },
    });
  }
  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      ...shared,
      id: LINE_LAYER_ID,
      type: "line",
      paint: {
        "line-color": UNSELECTED_COLOR,
        "line-width": 4,
        "line-opacity": 0.75,
      },
    });
  }
  if (!map.getLayer(SELECTED_LAYER_ID)) {
    map.addLayer({
      ...shared,
      id: SELECTED_LAYER_ID,
      type: "line",
      paint: {
        "line-color": SELECTED_COLOR,
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }
  highlightRoute(map, selectedKey);
};

/** Paint one route as the picked one, or none of them. */
export const highlightRoute = (map: MaplibreMap, key: string | null) => {
  if (!map.getLayer(SELECTED_LAYER_ID)) {
    return;
  }
  map.setFilter(SELECTED_LAYER_ID, routeFilter(key));
};

/** Take the routes off the map, layers and source. */
export const clearRoutes = (map: MaplibreMap) => {
  for (const layerId of LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }
  if (map.getSource(SOURCE_ID)) {
    map.removeSource(SOURCE_ID);
  }
};

/** True while the routes are on the map; a style rebuild makes this false. */
export const routesAreDrawn = (map: MaplibreMap) =>
  Boolean(map.getSource(SOURCE_ID)) && Boolean(map.getLayer(LINE_LAYER_ID));

/** how far the pointer may travel between press and release and still be a click */
const CLICK_SLOP = 3;

/**
 * Clicking a line calls back with the route's key; hovering one shows the hand,
 * so the lines read as something to click. Returns the way to undo all of it.
 *
 * The click is taken off the DOM, on the way down to the map, and not from the
 * map: a click on a route means "pick the hit at its end", so the map must not
 * also handle it as a click on the spot where the line happens to run. The host
 * would put its info box, its marker and its queries there, and the pick, which
 * clicks the hit itself a moment later, would race it. Only a click that
 * actually lands on a line is taken this way; every other one reaches the map
 * untouched.
 */
export const onRouteClick = (
  map: MaplibreMap,
  onPick: (key: string) => void
) => {
  const pickable = [LINE_LAYER_ID, SELECTED_LAYER_ID, CASING_LAYER_ID];
  const container = map.getContainer();

  const pointOf = (event: MouseEvent) => {
    const rect = map.getCanvas().getBoundingClientRect();
    return new maplibregl.Point(
      event.clientX - rect.left,
      event.clientY - rect.top
    );
  };
  const routeKeyAt = (point: maplibregl.Point) => {
    const drawn = pickable.filter((layerId) => map.getLayer(layerId));
    if (drawn.length === 0) {
      return undefined;
    }
    try {
      return map
        .queryRenderedFeatures(point, { layers: drawn })
        .map((feature) => feature.properties?.[KEY_PROPERTY])
        .find(
          (candidate): candidate is string => typeof candidate === "string"
        );
    } catch {
      return undefined;
    }
  };

  // a drag of the map ends in a click of its own; only a pointer that stayed
  // where it was pressed is picking something
  let pressedAt: maplibregl.Point | null = null;
  const handleDown = (event: MouseEvent) => {
    pressedAt = pointOf(event);
  };
  const handleClick = (event: MouseEvent) => {
    const point = pointOf(event);
    const dragged =
      !pressedAt ||
      Math.abs(point.x - pressedAt.x) > CLICK_SLOP ||
      Math.abs(point.y - pressedAt.y) > CLICK_SLOP;
    pressedAt = null;
    if (dragged) {
      return;
    }
    const key = routeKeyAt(point);
    if (!key) {
      return;
    }
    // the map never sees this one: it belongs to the route
    event.stopPropagation();
    onPick(key);
  };

  const showHand = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const hideHand = () => {
    map.getCanvas().style.cursor = "";
  };

  container.addEventListener("mousedown", handleDown, true);
  container.addEventListener("click", handleClick, true);
  for (const layerId of pickable) {
    map.on("mouseenter", layerId, showHand);
    map.on("mouseleave", layerId, hideHand);
  }
  return () => {
    container.removeEventListener("mousedown", handleDown, true);
    container.removeEventListener("click", handleClick, true);
    for (const layerId of pickable) {
      map.off("mouseenter", layerId, showHand);
      map.off("mouseleave", layerId, hideHand);
    }
    hideHand();
  };
};
