import { useCallback, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { useMapMeasurementsContext } from "@carma-commons/measurements";
import { parseToMapLayer } from "@carma-mapping/utils";

import {
  DEFAULT_MEASUREMENT_EMOJI_UNIFIED,
  buildSavedMeasurementFeatureData,
  buildSavedMeasurementLayerItem,
  hashSavedMeasurementLayerContent,
  type PickedMeasurementEmoji,
  resolveSavedMeasurementFeatureTitle,
  resolveUniqueSavedMeasurementFeatureTitle,
} from "../helper/save-measurements";
import type { AppDispatch } from "../store";
import {
  appendLayer,
  setActiveInteractionLayerID,
} from "../store/slices/mapping";
import { addMeasurement, getMeasurements } from "../store/slices/measurements";
import { setUIMode, UIMode } from "../store/slices/ui";

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const useSaveMeasurementsForm = () => {
  const dispatch = useDispatch<AppDispatch>();
  const measurements = useSelector(getMeasurements);
  const { shapes, clearAllShapes, config } = useMapMeasurementsContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUnified, setSelectedUnified] = useState<string>(
    DEFAULT_MEASUREMENT_EMOJI_UNIFIED
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [clearAfterSave, setClearAfterSave] = useState(false);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setSelectedUnified(DEFAULT_MEASUREMENT_EMOJI_UNIFIED);
    setClearAfterSave(false);
  }, []);

  const closeMeasurementInteraction = useCallback(() => {
    resetForm();
    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
  }, [dispatch, resetForm]);

  const clearShapesWhenRequested = useCallback(() => {
    if (clearAfterSave) {
      clearAllShapes();
    }
  }, [clearAfterSave, clearAllShapes]);

  const buildCurrentFeatureData = useCallback(
    (featureTitleOverride?: string) =>
      buildSavedMeasurementFeatureData({
        description,
        selectedUnified,
        shapes,
        title: featureTitleOverride ?? title,
      }),
    [description, selectedUnified, shapes, title]
  );

  const handleEmojiSelect = useCallback((emoji: PickedMeasurementEmoji) => {
    setSelectedUnified(emoji.unified);
    setEmojiPickerOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (shapes.length === 0) {
      return;
    }

    const baseTitle = resolveSavedMeasurementFeatureTitle(title);
    const existingTitles = new Set(
      measurements.flatMap((measurement) =>
        typeof measurement.title === "string" ? [measurement.title] : []
      )
    );
    const uniqueTitle = resolveUniqueSavedMeasurementFeatureTitle(
      baseTitle,
      existingTitles
    );
    const savedFeatureData = buildCurrentFeatureData(uniqueTitle);
    const contentHash = hashSavedMeasurementLayerContent({
      ...savedFeatureData,
      selectedUnified,
    });
    const item = buildSavedMeasurementLayerItem({
      ...savedFeatureData,
      featureId: `measurement-${Date.now()}-${contentHash}`,
    });
    const parsedLayer = await parseToMapLayer(item, false, true);

    if (parsedLayer) {
      dispatch(appendLayer(parsedLayer));
    }

    dispatch(addMeasurement(item));
    clearShapesWhenRequested();
    closeMeasurementInteraction();
  }, [
    buildCurrentFeatureData,
    clearShapesWhenRequested,
    closeMeasurementInteraction,
    dispatch,
    measurements,
    shapes.length,
    selectedUnified,
    title,
  ]);

  const handleDownload = useCallback(() => {
    if (shapes.length === 0) {
      return;
    }

    const { featureData, featureTitle } = buildCurrentFeatureData();
    downloadJson(featureData, `${featureTitle}.json`);
    clearShapesWhenRequested();
    closeMeasurementInteraction();
  }, [
    buildCurrentFeatureData,
    clearShapesWhenRequested,
    closeMeasurementInteraction,
    shapes.length,
  ]);

  return {
    clearAfterSave,
    description,
    emojiPickerOpen,
    handleDownload,
    handleEmojiSelect,
    handleSave,
    hasShapes: shapes.length > 0,
    infoBoxHeaderColor: config.infoBoxHeaderColor,
    selectedUnified,
    setClearAfterSave,
    setDescription,
    setEmojiPickerOpen,
    setTitle,
    title,
  };
};
