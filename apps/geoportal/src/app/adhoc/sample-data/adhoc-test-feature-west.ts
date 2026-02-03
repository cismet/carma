import type { AdhocFeature } from "@carma-appframeworks/portals";

export const ADHOC_TEST_FEATURE_WEST: AdhocFeature = {
  id: "carma-adhoc-test-feature-west",
  kind: "maplibre-style",
  data: {
    version: 8,
    metadata: {
      carmaConf: {
        layerInfo: {
          title: "Testfläche West",
          accentColor: "#0F4C81",
        },
      },
    },
    sources: {
      adhoc: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                carmaConf3D: {
                  groundPolyline: true,
                },
                info: {
                  title: "Testfläche West",
                  subtitle: "Quadrat 200m westlich vom Rathausvorplatz",
                  additionalInfo: "Adhoc Testfläche",
                  actions: [{ name: "zoomToFeature" }, {}],
                },
              },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [7.19711, 51.27154],
                    [7.19711, 51.2719],
                    [7.19769, 51.2719],
                    [7.19769, 51.27154],
                    [7.19711, 51.27154],
                  ],
                ],
              },
            },
          ],
        },
      },
    },
    layers: [
      {
        id: "ill-id",
        type: "fill",
        source: "adhoc",
        minzoom: 0,
        maxzoom: 22,
        paint: {
          "fill-color": "#0F4C81",
          "fill-opacity": 0.3,
        },
      },
      {
        id: "ill-outline",
        type: "line",
        source: "adhoc",
        minzoom: 0,
        maxzoom: 22,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#0d3a0e",
          "line-width": 2,
        },
      },
      {
        id: "selection-line",
        type: "line",
        source: "adhoc",
        minzoom: 0,
        maxzoom: 24,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": "#3A7CEB",
          "line-width": 4,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            1,
            0,
          ],
        },
      },
    ],
  },
};
