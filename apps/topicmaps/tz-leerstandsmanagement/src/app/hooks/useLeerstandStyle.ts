import { useMemo } from "react";
import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";
import type { LeerstandFeatureCollection } from "../helper/leerstandApi";

/** vector tile source with the ALKIS buildings (source layer `building`) */
export const ALKIS_SOURCE = "alkis_data";
/** GeoJSON source that receives the Leerstand points via `setData` */
export const LEERSTAND_SOURCE = "leerstaende";
/** the building footprints are drawn from this zoom on; below it a tap cannot tell a building from open ground */
export const BUILDING_MINZOOM = 15;

const EMPTY_FEATURE_COLLECTION: LeerstandFeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** zoom-dependent point radius, scaled by the symbol size setting (35 = unscaled) */
const circleRadius = (markerSymbolSize: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.75],
  ["zoom"],
  0,
  (3 * markerSymbolSize) / 35,
  16,
  (10 * markerSymbolSize) / 35,
  22,
  (26 * markerSymbolSize) / 35,
];

const circleStrokeWidth = (
  markerSymbolSize: number
): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.75],
  ["zoom"],
  0,
  (0.1 * markerSymbolSize) / 35,
  16,
  (4 * markerSymbolSize) / 35,
  22,
  (10 * markerSymbolSize) / 35,
];

/**
 * Style for the single vector layer of the map, modelled on the tree style of
 * tz-baumbewirtschaftung: layers whose id contains "selection" are painted
 * through the `selected` feature state that LibreMap sets on a hit.
 * The building layers copy the ALKIS style at tiles.cismet.de/alkis. The
 * Leerstand points travel inline in the geojson source, so every reload of
 * the feature collection yields a new style and LibreMap re-merges it.
 */
export const useLeerstandStyle = (
  markerSymbolSize: number,
  leerstaende?: LeerstandFeatureCollection
): StyleSpecification =>
  useMemo<StyleSpecification>(
    () => ({
      version: 8,
      sources: {
        [ALKIS_SOURCE]: {
          type: "vector",
          tiles: ["https://tiles.cismet.de/alkis/{z}/{x}/{y}.pbf"],
          minzoom: 9,
          maxzoom: 17,
        },
        [LEERSTAND_SOURCE]: {
          type: "geojson",
          data: leerstaende ?? EMPTY_FEATURE_COLLECTION,
        },
      },
      layers: [
        {
          id: "gebaeude_fill",
          type: "fill",
          source: ALKIS_SOURCE,
          "source-layer": "building",
          minzoom: BUILDING_MINZOOM,
          paint: {
            "fill-color": "#1565c0",
            "fill-opacity": 0.1,
          },
        },
        {
          id: "gebaeude_outlines",
          type: "line",
          source: ALKIS_SOURCE,
          "source-layer": "building",
          minzoom: BUILDING_MINZOOM,
          paint: {
            "line-color": "#000000",
            "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.05, 21, 2],
          },
        },
        {
          id: "gebaeude_selection",
          type: "line",
          source: ALKIS_SOURCE,
          "source-layer": "building",
          minzoom: 0,
          paint: {
            "line-color": "#3A7CEB",
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              1,
              0,
            ],
            "line-width": 3,
          },
        },
        {
          id: "leerstand-dots",
          type: "circle",
          source: LEERSTAND_SOURCE,
          minzoom: 0,
          maxzoom: 24,
          paint: {
            "circle-radius": circleRadius(markerSymbolSize),
            "circle-color": "#c62828",
            "circle-stroke-color": "#7f0000",
            "circle-stroke-width": circleStrokeWidth(markerSymbolSize),
            "circle-opacity": 0.8,
            "circle-stroke-opacity": 1,
          },
        },
        {
          id: "leerstand-dots-selection",
          type: "circle",
          source: LEERSTAND_SOURCE,
          minzoom: 0,
          maxzoom: 24,
          paint: {
            "circle-radius": circleRadius(markerSymbolSize),
            "circle-color": "#3A7CEB",
            "circle-stroke-color": "#0D6759",
            "circle-stroke-width": circleStrokeWidth(markerSymbolSize),
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.8,
              0,
            ],
            "circle-stroke-opacity": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              0.8,
              0,
            ],
          },
        },
      ],
    }),
    [markerSymbolSize, leerstaende]
  );
