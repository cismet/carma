import { BRUECKENENTWURF_GLB } from "@carma-commons/resources";
import type { AdhocFeature } from "@carma-appframeworks/portals";

export const ADHOC_TEST_FEATURE: AdhocFeature = {
  id: "carma-adhoc-test-feature",
  payload: {
    kind: "geojson",
    crs: "EPSG:4326",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            info: {
              title: "Rathausvorplatz",
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
            type: "Polygon",
            coordinates: [
              [
                [7.1997938, 51.2718446],
                [7.2000681, 51.2714216],
                [7.2007989, 51.2716088],
                [7.2005394, 51.2720296],
                [7.1997938, 51.2718446],
              ],
            ],
          },
        },
      ],
    },
  },
  metadata: {
    title: "Rathausvorplatz",
    accentColor: "#155317",
  },
};

export const ADHOC_TEST_FEATURE_WEST: AdhocFeature = {
  id: "carma-adhoc-test-feature-west",
  payload: {
    kind: "geojson",
    crs: "EPSG:4326",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
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
  metadata: {
    title: "Testfläche West",
    accentColor: "#0F4C81",
  },
};

export const ADHOC_TEST_FEATURE_Z: AdhocFeature = {
  id: "carma-adhoc-test-feature-z",
  payload: {
    kind: "geojson",
    crs: "EPSG:4326",
    data: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {
            info: {
              title: "Shell Tankstelle (Z)",
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
                [7.1997938, 51.2718446],
                [7.2000681, 51.2714216],
                [7.2007989, 51.2716088],
                [7.2005394, 51.2720296, 155],
                [7.1997938, 51.2718446],
              ],
            ],
          },
        },
      ],
    },
  },
  metadata: {
    title: "Rathausvorplatz (Z)",
    accentColor: "#155317",
  },
};

export const ADHOC_TEST_MODEL: AdhocFeature = {
  id: "carma-adhoc-test-model",
  payload: {
    kind: "model",
    data: {
      url: BRUECKENENTWURF_GLB.model.uri,
      position: {
        lon: BRUECKENENTWURF_GLB.position.longitude,
        lat: BRUECKENENTWURF_GLB.position.latitude,
        height: BRUECKENENTWURF_GLB.position.altitude,
      },
      heading: BRUECKENENTWURF_GLB.orientation?.heading,
      pitch: BRUECKENENTWURF_GLB.orientation?.pitch,
      roll: BRUECKENENTWURF_GLB.orientation?.roll,
    },
  },
  properties: BRUECKENENTWURF_GLB.properties,
  metadata: {
    title: BRUECKENENTWURF_GLB.name,
  },
};