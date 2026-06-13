import { useDispatch, useSelector } from "react-redux";

import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  buildExternalAnnotationsAppendOptions,
  selectAuthoringAnnotationEntries,
  type AnnotationsRuntimeGeoJsonFeatureCollection,
  useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_VISIBILITIES,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";
import { parseToMapLayer } from "@carma-mapping/utils";

import {
  appendLayer,
  setActiveInteractionLayerID,
  getLayers,
} from "../../store/slices/mapping";
import {
  addMeasurement,
  getMeasurements,
} from "../../store/slices/measurements";
import { setUIMode, UIMode } from "../../store/slices/ui";
import MeasurementSavePanel from "./MeasurementSavePanel";
import {
  downloadMeasurementJsonFile,
  getUniqueTitle,
  hashString,
  MEASUREMENT_THUMBNAIL_URL,
  type MeasurementSaveValues,
} from "./measurement-save-utils";

const MEASUREMENT_VECTOR_LEGEND_URL =
  "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/legenden/measurements3D.png";

const MEASUREMENT_SERVICE_NAME = "measurements";
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
  source: ADHOC_LAYER_SOURCES.ANNOTATIONS,
  visibility: ADHOC_LAYER_VISIBILITIES.THREE_D,
  version: 8,
  glyphs: "https://tiles.cismet.de/fonts/{fontstack}/{range}.pbf",
  metadata: {
    carmaConf: {
      instant: true,
      annotationsGeoJson,
      layerInfo: {
        title,
        icon,
        description,
        metaDataText:
          'Messung-Steuerelemente stellen eine oder mehrere 3D-Messungsgeometrien bereit, die lokal unter "Objekte / Meine Messungen" gespeichert wurden.',
        keywords: ["carmaconf://lazyInfoBox"],
        thumbnail: MEASUREMENT_THUMBNAIL_URL,
        vectorLegend: MEASUREMENT_VECTOR_LEGEND_URL,
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

function SaveCesiumAnnotations({ layer }: { layer: Layer }) {
  const dispatch = useDispatch();
  const activeLayers = useSelector(getLayers);
  const measurements = useSelector(getMeasurements);
  const {
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    buildAllAnnotationsGeoJson,
    removeAnnotationsByIds,
  } = useAnnotationsRuntime();
  const authoringAnnotationEntries = selectAuthoringAnnotationEntries({
    annotationEntries,
  });
  const hasAuthoringAnnotations = authoringAnnotationEntries.length > 0;

  const buildFeatureData = (values: MeasurementSaveValues, title: string) => {
    const trimmedDescription = values.description.trim();
    const featureDescription = trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "";
    const icon = `emoji:${values.selectedUnified}`;
    const rawAnnotationsGeoJson = buildAllAnnotationsGeoJson();
    const annotationsGeoJson = buildCesiumAnnotationLayerGeoJson(
      rawAnnotationsGeoJson
    );
    const featureData = buildCesiumAnnotationLayerStyle({
      annotationsGeoJson,
      title,
      icon,
      description: trimmedDescription,
    });

    return {
      annotationsGeoJson,
      featureData,
      featureDescription,
      icon,
    };
  };

  const clearAnnotations = () => {
    removeAnnotationsByIds(
      authoringAnnotationEntries.map((annotationEntry) => annotationEntry.id),
      {
        skipConfirmation: true,
        source: ANNOTATION_DELETE_CONFIRMATION_SOURCES.UI,
      }
    );
  };

  const handleSave = async (values: MeasurementSaveValues) => {
    if (!hasAuthoringAnnotations) return;

    const baseTitle = values.title.trim() || "Messung";
    const existingTitles = new Set(
      measurements.map((measurement) => measurement.title)
    );
    const featureTitle = getUniqueTitle(baseTitle, existingTitles);
    const { annotationsGeoJson, featureData, featureDescription, icon } =
      buildFeatureData(values, featureTitle);
    const featureId = buildCesiumAnnotationLayerId(annotationsGeoJson);
    const externalCollection = {
      type: "saved-measurement",
      id: featureId,
    } as const;
    const existingMeasurement = measurements.find(
      (measurement) => measurement.id === featureId
    );

    const item: any = existingMeasurement ?? {
      description: featureDescription,
      icon,
      id: featureId,
      layerType: "vector",
      metadata: {
        carmaConf: {
          annotationsGeoJson,
        },
      },
      serviceName: MEASUREMENT_SERVICE_NAME,
      tags: ["Messung", "3D-Messung"],
      keywords: [],
      thumbnail: MEASUREMENT_THUMBNAIL_URL,
      title: featureTitle,
      type: "object",
      vectorStyle: JSON.stringify(featureData),
    };

    try {
      const parsedLayer = await parseToMapLayer(item, false, true);
      const existingActiveLayer = activeLayers.find(
        (activeLayer) => activeLayer.id === featureId
      );
      if (parsedLayer) {
        if (!existingActiveLayer) {
          dispatch(appendLayer(parsedLayer));
        }
      }
    } catch (error) {
      console.warn("Failed to append saved 3D measurement layer:", error);
    }

    if (values.clearAfterSave) {
      clearAnnotations();
    }

    dispatch(addMeasurement(item));
    appendAnnotationsRuntimePersistenceState(
      annotationsGeoJson.metadata.carmaConf.annotationsRuntimePersistence,
      buildExternalAnnotationsAppendOptions(externalCollection)
    );

    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
  };

  const handleDownload = (values: MeasurementSaveValues) => {
    if (!hasAuthoringAnnotations) return;

    const baseTitle = values.title.trim() || "Messung";
    const { featureData } = buildFeatureData(values, baseTitle);
    downloadMeasurementJsonFile(`${baseTitle}.json`, featureData);

    if (values.clearAfterSave) {
      clearAnnotations();
    }

    dispatch(setActiveInteractionLayerID(null));
  };

  return (
    <MeasurementSavePanel
      disabled={!hasAuthoringAnnotations}
      onPortalSave={handleSave}
      onFileSave={handleDownload}
    />
  );
}

export default SaveCesiumAnnotations;
