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
import type { Layer } from "@carma-mapping/layers";
import { parseToMapLayer } from "@carma-mapping/utils";

import MeasurementSavePanel from "./MeasurementSavePanel";
import {
  hashString,
  getUniqueTitle,
  MEASUREMENT_THUMBNAIL_URL,
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

    const featureData = shapesToFeatureCollection(shapes, {
      title: featureTitle,
      icon: `emoji:${values.selectedUnified}`,
      description: trimmedDescription,
      thumbnail: MEASUREMENT_THUMBNAIL_URL,
      source: "2dMeasurements",
      visibility: "2d",
    });

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

    const blob = new Blob([JSON.stringify(featureData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${featureTitle}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

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
