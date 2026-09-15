import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
} from "maplibre-gl";

import { ROUTE_CASING } from "@carma-mapping/routing";

/**
 * The route being driven, drawn by the addon that drives it.
 *
 * While a navigation runs the map shows one route and no other: whoever
 * produced it takes their own lines off (the ranking hides its candidates),
 * and this draws the single line the user is on. That way the picture belongs
 * to the navigation rather than to the producer, and a second producer of
 * routes gets it without drawing anything itself.
 *
 * The line is in two colours, split where the user is: gray for the stretch
 * already driven, blue for what is still ahead. One line, not two: MapLibre
 * paints it with a `line-gradient` over `line-progress`, which is why the
 * source is created with `lineMetrics`. A step, not a fade, because the split
 * is a place on the route and not a transition. Moving the split is one paint
 * property per fix, with no geometry rebuilt.
 */

const SOURCE_ID = "carma-route-line";
const CASING_LAYER_ID = `${SOURCE_ID}-casing`;
const LINE_LAYER_ID = `${SOURCE_ID}-line`;
/** bottom first: the casing is the outline under the line */
const LAYER_IDS = [CASING_LAYER_ID, LINE_LAYER_ID];

/** the map's click handling reads this and walks past the line */
const NON_SELECTABLE = { carmaConf: { nonSelectable: true } };

export type RouteLineColors = {
  /** the stretch still ahead of the user */
  aheadColor: string;
  /** the stretch already behind them */
  travelledColor: string;
};

/**
 * Where the colour changes, as a fraction of the line. Kept just inside the
 * ends: a step stop exactly at 0 or 1 would put a sliver of the other colour
 * at the tip of the line, which reads as a rendering fault rather than as
 * progress. Without a fraction (no fix yet) the whole line is still ahead.
 */
const gradient = (
  fraction: number | null,
  { aheadColor, travelledColor }: RouteLineColors
): ExpressionSpecification => {
  const behind =
    fraction === null || fraction <= 0 ? aheadColor : travelledColor;
  const split = Math.min(0.9999, Math.max(0.0001, fraction ?? 0));
  return ["step", ["line-progress"], behind, split, aheadColor];
};

const featureCollection = (coordinates: [number, number][]) => ({
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates },
    },
  ],
});

/**
 * Draw the route, or update the one already drawn. Safe to call again with the
 * same route, which is what a style rebuild needs: it drops the source and the
 * layers, and this puts them back.
 */
export const drawRouteLine = (
  map: MaplibreMap,
  coordinates: [number, number][],
  fraction: number | null,
  colors: RouteLineColors
) => {
  if (coordinates.length < 2) {
    return;
  }
  const data = featureCollection(coordinates);
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (source) {
    source.setData(data);
  } else {
    // `lineMetrics` is what makes `line-progress` mean anything, and it can
    // only be asked for when the source is created
    map.addSource(SOURCE_ID, { type: "geojson", lineMetrics: true, data });
  }

  const shared = {
    source: SOURCE_ID,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
    metadata: NON_SELECTABLE,
  };
  if (!map.getLayer(CASING_LAYER_ID)) {
    map.addLayer({
      ...shared,
      id: CASING_LAYER_ID,
      type: "line",
      paint: {
        "line-color": ROUTE_CASING,
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
        // the width and opacity the picked candidate had, so pressing start
        // changes the colours behind the user and nothing else
        "line-width": 6,
        "line-opacity": 0.95,
        "line-gradient": gradient(fraction, colors),
      },
    });
    return;
  }
  setRouteLineProgress(map, fraction, colors);
};

/** Move the split to where the user is now. */
export const setRouteLineProgress = (
  map: MaplibreMap,
  fraction: number | null,
  colors: RouteLineColors
) => {
  if (!map.getLayer(LINE_LAYER_ID)) {
    return;
  }
  map.setPaintProperty(
    LINE_LAYER_ID,
    "line-gradient",
    gradient(fraction, colors)
  );
};

/** Take the route off the map, layers and source. */
export const clearRouteLine = (map: MaplibreMap) => {
  for (const layerId of LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
  }
  if (map.getSource(SOURCE_ID)) {
    map.removeSource(SOURCE_ID);
  }
};

/** True while the route is on the map; a style rebuild makes this false. */
export const routeLineIsDrawn = (map: MaplibreMap) =>
  Boolean(map.getSource(SOURCE_ID)) && Boolean(map.getLayer(LINE_LAYER_ID));
