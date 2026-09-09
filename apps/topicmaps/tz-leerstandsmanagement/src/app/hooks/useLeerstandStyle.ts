import { useMemo } from "react";

/** vector tile source with the ALKIS buildings (source layer `building`) */
export const ALKIS_SOURCE = "alkis_data";
/** GeoJSON source that receives the Leerstand points via `setData` */
export const LEERSTAND_SOURCE = "leerstaende";

const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

/**
 * Style for the single vector layer of the map, modelled on the tree style of
 * tz-baumbewirtschaftung: layers whose id contains "selection" are painted
 * through the `selected` feature state that react-cismap sets on a hit.
 * The building layers copy the ALKIS style at tiles.cismet.de/alkis.
 */
export const useLeerstandStyle = (markerSymbolSize: number) =>
  useMemo(
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
          data: EMPTY_FEATURE_COLLECTION,
        },
      },
      layers: [
        {
          id: "gebaeude_fill",
          type: "fill",
          source: ALKIS_SOURCE,
          "source-layer": "building",
          minzoom: 15,
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
          minzoom: 15,
          paint: {
            "line-color": "#000000",
            "line-width": {
              stops: [
                [13, 0.05],
                [21, 2],
              ],
            },
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
            "circle-radius": {
              base: 1.75,
              stops: [
                [0, (3 * markerSymbolSize) / 35],
                [16, (10 * markerSymbolSize) / 35],
                [22, (26 * markerSymbolSize) / 35],
              ],
            },
            "circle-color": "#c62828",
            "circle-stroke-color": "#7f0000",
            "circle-stroke-width": {
              base: 1.75,
              stops: [
                [0, (0.1 * markerSymbolSize) / 35],
                [16, (4 * markerSymbolSize) / 35],
                [22, (10 * markerSymbolSize) / 35],
              ],
            },
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
            "circle-radius": {
              base: 1.75,
              stops: [
                [0, (3 * markerSymbolSize) / 35],
                [16, (10 * markerSymbolSize) / 35],
                [22, (26 * markerSymbolSize) / 35],
              ],
            },
            "circle-color": "#3A7CEB",
            "circle-stroke-color": "#0D6759",
            "circle-stroke-width": {
              base: 1.75,
              stops: [
                [0, (0.1 * markerSymbolSize) / 35],
                [16, (4 * markerSymbolSize) / 35],
                [22, (10 * markerSymbolSize) / 35],
              ],
            },
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
    [markerSymbolSize]
  );
