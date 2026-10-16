import {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_MAP_MODES,
} from "@carma-appframeworks/portals";
import type { AnnotationsRuntimeGeoJsonFeatureCollection } from "@carma-mapping/annotations/runtime";

import {
  hashString,
  MEASUREMENT_3D_THUMBNAIL_URL,
  SAVED_MEASUREMENT_FOCUS_OBJECT_LABEL,
} from "./measurement-save-utils";

const MEASUREMENT_VECTOR_LEGEND_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/legenden/measurements3D.png";

const SAVED_MEASUREMENT_COLOR = "#267bdc";

export const buildCesiumAnnotationLayerGeoJson = (
  annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection
): AnnotationsRuntimeGeoJsonFeatureCollection => annotationsGeoJson;

export const buildCesiumAnnotationLayerId = (
  annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection
) => {
  const contentHash = hashString(
    JSON.stringify(
      annotationsGeoJson.metadata.carmaConf.annotationsRuntimePersistence
    )
  );
  return `measurement-3d-${contentHash}`;
};

export const buildCesiumAnnotationLayerStyle = ({
  annotationsGeoJson,
  title,
  icon,
  description,
}: {
  annotationsGeoJson: AnnotationsRuntimeGeoJsonFeatureCollection;
  title: string;
  icon: string;
  description: string;
}) => ({
  version: 8,
  glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
  metadata: {
    carmaConf: {
      instant: true,
      annotationsGeoJson,
      focusObjectLabel: SAVED_MEASUREMENT_FOCUS_OBJECT_LABEL,
      layerInfo: {
        title,
        icon,
        description,
        metaDataText:
          'Messung-Steuerelemente stellen eine oder mehrere 3D-Messungsgeometrien bereit, die lokal unter "Objekte / Meine Messungen" gespeichert wurden.',
        keywords: ["carmaconf://lazyInfoBox"],
        thumbnail: MEASUREMENT_3D_THUMBNAIL_URL,
        vectorLegend: MEASUREMENT_VECTOR_LEGEND_URL,
        source: ADHOC_LAYER_SOURCES.ANNOTATIONS,
        mapMode: ADHOC_LAYER_MAP_MODES.THREE_D,
      },
    },
  },
  sources: {
    adhoc: {
      type: "geojson",
      data: annotationsGeoJson,
    },
  },
  layers: [
    {
      id: "adhoc-3d-measurements-fill",
      type: "fill",
      source: "adhoc",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": SAVED_MEASUREMENT_COLOR,
        "fill-opacity": 0.3,
      },
    },
    {
      id: "adhoc-3d-measurements-line",
      type: "line",
      source: "adhoc",
      filter: [
        "any",
        ["==", ["geometry-type"], "Polygon"],
        ["==", ["geometry-type"], "LineString"],
      ],
      paint: {
        "line-color": SAVED_MEASUREMENT_COLOR,
        "line-width": 3,
      },
    },
    {
      id: "adhoc-3d-measurements-point",
      type: "circle",
      source: "adhoc",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-color": SAVED_MEASUREMENT_COLOR,
        "circle-radius": 5,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    },
  ],
});
