import type { AdhocFeature } from "@carma-appframeworks/portals";

export const ADHOC_TEST_FEATURE_Z: AdhocFeature = {
  id: "carma-adhoc-test-feature-z",
  kind: "maplibre-style",
  data: {
    version: 8,
    metadata: {
      carmaConf: {
        layerInfo: {
          title: "Mit Geometrie mit Höhen",
          accentColor: "#155317",
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
                  title: "Mit Geometrie mit Höhen",
                  subtitle:
                    "Autobahnanbindung A1 (Dreieck Wuppertal Nord) und A46 (Wuppertal Oberbarmen).",
                  additionalInfo: "Schmiedestraße 91",
                  actions: [{ name: "zoomToFeature" }, {}],
                },
              },
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [7.198393872955297, 51.27184467128174, 185],
                    [7.198668140581777, 51.271421654931885, 185],
                    [7.199398931221499, 51.27160887589554, 185],
                    [7.199139467583894, 51.27202964895409, 185],
                    [7.198393872955297, 51.27184467128174, 185],
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
          "fill-color": "#155317",
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
