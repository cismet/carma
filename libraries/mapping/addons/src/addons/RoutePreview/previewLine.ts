import type {
  FilterSpecification,
  GeoJSONSource,
  Map as MaplibreMap,
} from "maplibre-gl";

import { ROUTE_BLUE, ROUTE_CASING } from "@carma-mapping/routing";

/**
 * A route that is only being looked at, drawn by whoever produced it when no
 * one else draws it: a test route, a route to a long-pressed point. "In der
 * Nähe" draws its own candidates and needs none of this.
 *
 * Its own source rather than the navigation's line (`Routing/routeLine.ts`):
 * the navigation draws and clears that one by itself, and a preview sharing it
 * would be taken off the map whenever a navigation ends. The preview is hidden
 * while a navigation runs, so the two never show at once.
 *
 * A line and a dot at its end: the destination of a route to a point on the
 * map is nothing but that point, and without the dot the line just stops.
 */

const SOURCE_ID = "carma-route-preview";
const CASING_LAYER_ID = `${SOURCE_ID}-casing`;
const LINE_LAYER_ID = `${SOURCE_ID}-line`;
const DESTINATION_LAYER_ID = `${SOURCE_ID}-destination`;
/** bottom first */
const LAYER_IDS = [CASING_LAYER_ID, LINE_LAYER_ID, DESTINATION_LAYER_ID];

/** the map's click handling reads this and walks past the line */
const NON_SELECTABLE = { carmaConf: { nonSelectable: true } };

const featureCollection = (coordinates: [number, number][]) => ({
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "LineString" as const, coordinates },
    },
    {
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "Point" as const,
        coordinates: coordinates[coordinates.length - 1],
      },
    },
  ],
});

/**
 * Draw the route, or update the one already drawn. Safe to call again, which
 * is what a style rebuild needs: it drops the source and the layers.
 */
export const drawPreviewLine = (
  map: MaplibreMap,
  coordinates: [number, number][]
) => {
  if (coordinates.length < 2) {
    return;
  }
  const data = featureCollection(coordinates);
  const source = map.getSource<GeoJSONSource>(SOURCE_ID);
  if (source) {
    source.setData(data);
  } else {
    map.addSource(SOURCE_ID, { type: "geojson", data });
  }

  const shared = { source: SOURCE_ID, metadata: NON_SELECTABLE };
  const line = {
    ...shared,
    type: "line" as const,
    filter: ["==", ["geometry-type"], "LineString"] as FilterSpecification,
    layout: { "line-cap": "round" as const, "line-join": "round" as const },
  };
  if (!map.getLayer(CASING_LAYER_ID)) {
    map.addLayer({
      ...line,
      id: CASING_LAYER_ID,
      paint: {
        "line-color": ROUTE_CASING,
        "line-width": 8,
        "line-opacity": 0.7,
      },
    });
  }
  if (!map.getLayer(LINE_LAYER_ID)) {
    map.addLayer({
      ...line,
      id: LINE_LAYER_ID,
      paint: {
        "line-color": ROUTE_BLUE,
        "line-width": 6,
        "line-opacity": 0.95,
      },
    });
  }
  if (!map.getLayer(DESTINATION_LAYER_ID)) {
    map.addLayer({
      ...shared,
      id: DESTINATION_LAYER_ID,
      type: "circle",
      filter: ["==", ["geometry-type"], "Point"] as FilterSpecification,
      paint: {
        "circle-radius": 7,
        "circle-color": "#ffffff",
        "circle-stroke-color": ROUTE_BLUE,
        "circle-stroke-width": 4,
      },
    });
  }
};

/** Take the route off the map, layers and source. */
export const clearPreviewLine = (map: MaplibreMap) => {
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
export const previewLineIsDrawn = (map: MaplibreMap) =>
  Boolean(map.getSource(SOURCE_ID)) && Boolean(map.getLayer(LINE_LAYER_ID));
