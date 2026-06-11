import { useDispatch, useSelector } from "react-redux";

import {
  appendLayer,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import {
  addMeasurement,
  getMeasurements,
} from "../../store/slices/measurements";
import { setUIMode, UIMode } from "../../store/slices/ui";
import {
  useMapMeasurementsContext,
  shapesToFeatureCollection,
} from "@carma-commons/measurements";
import {
  ADHOC_LAYER_SOURCES,
  ADHOC_LAYER_VISIBILITIES,
} from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";
import { parseToMapLayer } from "@carma-mapping/utils";

import MeasurementSavePanel from "./MeasurementSavePanel";
import {
  hashString,
  getUniqueTitle,
  MEASUREMENT_THUMBNAIL_URL,
  downloadMeasurementJsonFile,
  type MeasurementSaveValues,
} from "./measurement-save-utils";

function SaveMeasurements({ layer }: { layer: Layer }) {
  const dispatch = useDispatch();
  const measurements = useSelector(getMeasurements);
  const { shapes, clearAllShapes } = useMapMeasurementsContext();

  const buildFeatureData = (
    values: MeasurementSaveValues,
    featureTitle: string
  ) => {
    const trimmedDescription = values.description.trim();
    const featureDescription = trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "";

    const featureData = {
      ...shapesToFeatureCollection(shapes, {
        title: featureTitle,
        icon: `emoji:${values.selectedUnified}`,
        description: trimmedDescription,
        thumbnail: MEASUREMENT_THUMBNAIL_URL,
      }),
      source: ADHOC_LAYER_SOURCES.TWO_D_MEASUREMENTS,
      visibility: ADHOC_LAYER_VISIBILITIES.TWO_D,
    };

    return { featureData, featureTitle, featureDescription };
  };

  const handleSave = async (values: MeasurementSaveValues) => {
    if (shapes.length === 0) return;

    const baseTitle = values.title.trim() || "Messung";
    const existingTitles = new Set(
      measurements.map((measurement) => measurement.title)
    );
    const uniqueTitle = getUniqueTitle(baseTitle, existingTitles);

    const { featureData, featureTitle, featureDescription } = buildFeatureData(
      values,
      uniqueTitle
    );

    const contentHash = hashString(
      `${featureTitle}|${featureDescription}|${
        values.selectedUnified
      }|${JSON.stringify(featureData)}`
    );
    const featureId = `measurement-${Date.now()}-${contentHash}`;
    const layerInfo: Record<string, unknown> =
      featureData.metadata?.carmaConf?.layerInfo ?? {};
    const layerInfoTags = Array.isArray(layerInfo.tags) ? layerInfo.tags : [];
    const layerInfoKeywords = Array.isArray(layerInfo.keywords)
      ? layerInfo.keywords
      : [];

    const item: any = {
      ...layerInfo,
      description: featureDescription,
      id: featureId,
      layerType: "vector",
      title: featureTitle,
      serviceName: "measurements",
      type: "object",
      vectorStyle: JSON.stringify(featureData),
      tags: ["Messung", ...layerInfoTags],
      keywords: layerInfoKeywords,
    };

    const parsedLayer = await parseToMapLayer(item, false, true);

    if (parsedLayer) {
      dispatch(appendLayer(parsedLayer));
    }

    dispatch(addMeasurement(item));

    if (values.clearAfterSave) {
      clearAllShapes();
    }

    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
  };

  const handleDownload = (values: MeasurementSaveValues) => {
    if (shapes.length === 0) return;

    const baseTitle = values.title.trim() || "Messung";
    const { featureData, featureTitle } = buildFeatureData(values, baseTitle);

    downloadMeasurementJsonFile(`${featureTitle}.json`, featureData);

    if (values.clearAfterSave) {
      clearAllShapes();
    }

    dispatch(setActiveInteractionLayerID(null));
  };

  return (
    <MeasurementSavePanel
      disabled={shapes.length === 0}
      onPortalSave={handleSave}
      onFileSave={handleDownload}
    />
  );
}

export default SaveMeasurements;
