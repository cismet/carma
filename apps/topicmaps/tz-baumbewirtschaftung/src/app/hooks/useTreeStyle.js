import { useMemo } from "react";

export const useTreeStyle = (featureCollection, markerSymbolSize) => {
  return useMemo(() => {
    if (!featureCollection) {
      return null;
    }

    return {
      version: 8,
      sources: {
        trees: {
          type: "geojson",
          data: featureCollection,
        },
      },
      glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
      sprite: "https://tiles.cismet.de/poi/sprites",
      layers: [
        {
          id: "tree-dots",
          type: "circle",
          source: "trees",
          minzoom: 0,
          maxzoom: 24,
          layout: {
            visibility: "visible",
          },
          paint: {
            "circle-radius": {
              base: 1.75,
              stops: [
                [0, (3 * markerSymbolSize) / 35],
                [16, (10 * markerSymbolSize) / 35],
                [22, (26 * markerSymbolSize) / 35],
              ],
            },
            // Saturated colours, so done and not yet done trees stay apart
            // when zoomed out (wupp #4145).
            "circle-color": [
              "case",
              ["==", ["get", "latestActionStatus"], "done"],
              "#2E7D32", // deep green for done
              ["==", ["get", "latestActionStatus"], "open"],
              "#FFC107", // amber for open
              ["==", ["get", "latestActionStatus"], "exception"],
              "#E53935", // red for exception
              "#9E9E9E", // grey for none
            ],
            "circle-stroke-color": [
              "case",
              ["==", ["get", "latestActionStatus"], "done"],
              "#1B5E20", // darker green for done
              ["==", ["get", "latestActionStatus"], "open"],
              "#E65100", // dark orange for open
              ["==", ["get", "latestActionStatus"], "exception"],
              "#B71C1C", // dark red for exception
              "#424242", // dark grey for none
            ],
            "circle-stroke-width": {
              base: 1.75,
              stops: [
                [0, (1 * markerSymbolSize) / 35],
                [16, (4 * markerSymbolSize) / 35],
                [22, (10 * markerSymbolSize) / 35],
              ],
            },
            "circle-opacity": 1,
            "circle-stroke-opacity": 1,
          },
        },
        {
          id: "tree-dots-selected",
          type: "circle",
          source: "trees",
          minzoom: 0,
          maxzoom: 24,
          layout: {
            visibility: "visible",
          },
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
    };
  }, [featureCollection, markerSymbolSize]);
};
