import type { AdhocFeature } from "@carma-appframeworks/portals";

export const ADHOC_TEST_FEATURE: AdhocFeature = {
  id: "carma-adhoc-test-feature",
  kind: "maplibre-style",
  data: {
    version: 8,
    metadata: {
      carmaConf: {
        instant: true,
        layerInfo: {
          title: "Rathausvorplatz",
          accentColor: "#155317",
        },
      },
    },
    sources: {
      adhoc: {
        type: "geojson",
        generateId: true,
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {
                info: {
                  title: "Shell Tankstelle",
                  subtitle:
                    "Autobahnanbindung A1 (Dreieck Wuppertal Nord) und A46 (Wuppertal Oberbarmen).",
                  additionalInfo: "Schmiedestraße 91",
                  actions: [{ name: "zoomToFeature" }, {}],
                },
                tel: "+49-202-6294410",
                url: "https://www.think-ing.de/unternehmen/shell-deutsche-shell-holding-gmbh-hamburg",
                foto: "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
                fotos: [
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_01.jpg",
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_02.jpg",
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_03.jpg",
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_04.jpg",
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_05.jpg",
                  "https://www.wuppertal.de/geoportal/emobil/autos/fotos/wasserstoff_06.jpg",
                ],
              },
              geometry: {
                coordinates: [
                  [
                    [7.199793872955297, 51.27184467128174],
                    [7.200068140581777, 51.271421654931885],
                    [7.200798931221499, 51.27160887589554],
                    [7.200539467583894, 51.27202964895409],
                    [7.199793872955297, 51.27184467128174],
                  ],
                ],
                type: "Polygon",
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
