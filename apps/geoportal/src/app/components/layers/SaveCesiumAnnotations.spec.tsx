import { describe, expect, it } from "vitest";

import { ADHOC_LAYER_SOURCES } from "@carma-appframeworks/portals";
import { ANNOTATION_TYPES } from "@carma-mapping/annotations/core";
import type { AnnotationsRuntimeGeoJsonFeatureCollection } from "@carma-mapping/annotations/runtime";

import {
  buildCesiumAnnotationLayerGeoJson,
  buildCesiumAnnotationLayerId,
  buildCesiumAnnotationLayerStyle,
} from "./SaveCesiumAnnotations";
import { MEASUREMENT_3D_THUMBNAIL_URL } from "./measurement-save-utils";

const createAnnotationsGeoJson =
  (): AnnotationsRuntimeGeoJsonFeatureCollection => ({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "area-1",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [7, 51, 100],
              [7.001, 51, 100],
              [7.001, 51.001, 100],
              [7, 51, 100],
            ],
          ],
        },
        properties: {},
      },
      {
        type: "Feature",
        id: "distance-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [7, 51, 100],
            [7.001, 51.001, 101],
          ],
        },
        properties: {},
      },
      {
        type: "Feature",
        id: "point-1",
        geometry: {
          type: "Point",
          coordinates: [7, 51, 100],
        },
        properties: {},
      },
    ],
    metadata: {
      carmaConf: {
        formatId: "carma-3d-annotations-geojson",
        formatVersion: 1,
        source: "geoportal-cesium-annotations",
        annotationsRuntimePersistence: {
          formatId: "annotations-runtime-persistence",
          version: 1,
          tables: {
            annotationEntries: [
              {
                id: "area-1",
                toolType: ANNOTATION_TYPES.AREA_GROUND,
                nodeIds: ["node-1", "node-2", "node-3"],
                edgeIds: [],
              },
            ],
            nodes: [
              {
                id: "node-1",
                coordinate: { longitude: 7, latitude: 51, altitude: 100 },
              },
            ],
            linkedNodeGroups: [],
            edges: [],
          },
          settings: {
            elevationReferenceAnnotationId: null,
            lastActiveToolType: null,
            nextShortLabelCounterByToolType: {},
          },
        },
      },
    },
  });

describe("SaveCesiumAnnotations helpers", () => {
  it("keeps the runtime annotation GeoJSON unchanged", () => {
    const sourceGeoJson = createAnnotationsGeoJson();
    const geoJson = buildCesiumAnnotationLayerGeoJson(sourceGeoJson);

    expect(geoJson).toBe(sourceGeoJson);
  });

  it("builds a stable measurement id from the runtime persistence payload", () => {
    const sourceGeoJson = createAnnotationsGeoJson();
    const visualizedGeoJson =
      buildCesiumAnnotationLayerGeoJson(sourceGeoJson);

    expect(buildCesiumAnnotationLayerId(visualizedGeoJson)).toBe(
      buildCesiumAnnotationLayerId(sourceGeoJson)
    );
  });

  it("embeds the visualized GeoJSON as the saved vector style source", () => {
    const geoJson = buildCesiumAnnotationLayerGeoJson(
      createAnnotationsGeoJson()
    );
    const style = buildCesiumAnnotationLayerStyle({
      annotationsGeoJson: geoJson,
      description: "Dachmessung",
      icon: "emoji:1f4d0",
      title: "Messung",
    });

    expect(style.sources.adhoc.data).toBe(geoJson);
    expect(style.metadata.carmaConf.annotationsGeoJson).toBe(geoJson);
    expect(style.metadata.carmaConf.layerInfo).toMatchObject({
      description: "Dachmessung",
      icon: "emoji:1f4d0",
      thumbnail: MEASUREMENT_3D_THUMBNAIL_URL,
      title: "Messung",
      source: ADHOC_LAYER_SOURCES.ANNOTATIONS,
      mapMode: "3d",
    });
  });
});
