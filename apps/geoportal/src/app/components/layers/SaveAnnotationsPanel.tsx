import { useDispatch, useSelector } from "react-redux";

import {
  ANNOTATION_DELETE_CONFIRMATION_SOURCES,
  buildExternalAnnotationsAppendOptions,
  selectAuthoringAnnotationEntries,
  type useAnnotationsRuntime,
} from "@carma-mapping/annotations/runtime";
import { parseToMapLayer } from "@carma-mapping/utils";

import { MEASUREMENT_SERVICE_NAME } from "../../helper/adhoc-feature-utils";
import {
  appendLayer,
  setActiveInteractionLayerID,
  getLayers,
} from "../../store/slices/mapping";
import {
  addMeasurement,
  getMeasurements,
} from "../../store/slices/measurements";
import MeasurementSavePanel from "./MeasurementSavePanel";
import {
  downloadMeasurementJsonFile,
  getUniqueTitle,
  MEASUREMENT_3D_THUMBNAIL_URL,
  type MeasurementSaveValues,
} from "./measurement-save-utils";
import {
  buildCesiumAnnotationLayerGeoJson,
  buildCesiumAnnotationLayerId,
  buildCesiumAnnotationLayerStyle,
} from "./saved-measurement-layer";

/** The runtime services the panel works on: the Cesium provider or the 3D measurement addon. */
type SaveAnnotationsSource = Pick<
  ReturnType<typeof useAnnotationsRuntime>,
  | "annotationEntries"
  | "appendAnnotationsRuntimePersistenceState"
  | "buildAllAnnotationsGeoJson"
  | "removeAnnotationsByIds"
>;

export function SaveAnnotationsPanel({
  source,
  onSaved,
}: {
  source: SaveAnnotationsSource;
  /** After a portal save; the Cesium host leaves its measurement mode here. */
  onSaved?: () => void;
}) {
  const dispatch = useDispatch();
  const activeLayers = useSelector(getLayers);
  const measurements = useSelector(getMeasurements);
  const {
    annotationEntries,
    appendAnnotationsRuntimePersistenceState,
    buildAllAnnotationsGeoJson,
    removeAnnotationsByIds,
  } = source;
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

    const layerInfo: Record<string, unknown> =
      featureData.metadata?.carmaConf?.layerInfo ?? {};
    const layerInfoKeywords = Array.isArray(layerInfo.keywords)
      ? layerInfo.keywords
      : [];

    const item: any = existingMeasurement ?? {
      ...layerInfo,
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
      keywords: layerInfoKeywords,
      thumbnail: MEASUREMENT_3D_THUMBNAIL_URL,
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
    onSaved?.();
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
