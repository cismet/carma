import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Button, Checkbox, Input, Popover } from "antd";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data/sets/15/twitter.json";
import i18nDe from "@emoji-mart/data/i18n/de.json";

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
import { parseToMapLayer, twemojiUrl } from "@carma-mapping/utils";

import { APP_BASE_PATH } from "../../config/app.config";

const DEFAULT_EMOJI_UNIFIED = "1f4cf";

const hashString = (input: string) => {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const getUniqueTitle = (baseTitle: string, existingTitles: Set<string>) => {
  if (!existingTitles.has(baseTitle)) {
    return baseTitle;
  }
  let counter = 1;
  while (existingTitles.has(`${baseTitle} (${counter})`)) {
    counter++;
  }
  return `${baseTitle} (${counter})`;
};

type PickedEmoji = {
  native: string;
  unified: string;
  id: string;
};

function SaveMeasurements({ layer }: { layer: Layer }) {
  const dispatch = useDispatch();
  const measurements = useSelector(getMeasurements);
  const { shapes, clearAllShapes } = useMapMeasurementsContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUnified, setSelectedUnified] = useState<string>(
    DEFAULT_EMOJI_UNIFIED
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [clearAfterSave, setClearAfterSave] = useState(false);

  const handleEmojiSelect = (emoji: PickedEmoji) => {
    setSelectedUnified(emoji.unified);
    setEmojiPickerOpen(false);
  };

  const buildFeatureData = (featureTitle: string) => {
    const trimmedDescription = description.trim();
    const featureDescription = trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "";

    const featureData = shapesToFeatureCollection(shapes, {
      title: featureTitle,
      icon: `emoji:${selectedUnified}`,
      description: trimmedDescription,
      thumbnail:
        "https://wupp-digitaltwin-assets.cismet.de/v2/geoportal/thumbnails/measurements.png",
      source: "2dMeasurements",
      visibility: "2d",
    });

    return { featureData, featureTitle, featureDescription };
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSelectedUnified(DEFAULT_EMOJI_UNIFIED);
    setClearAfterSave(false);
  };

  const handleSave = async () => {
    if (shapes.length === 0) return;

    const baseTitle = title.trim() || "Messung";
    const existingTitles = new Set(
      measurements.map((measurement) => measurement.title)
    );
    const uniqueTitle = getUniqueTitle(baseTitle, existingTitles);

    const { featureData, featureTitle, featureDescription } =
      buildFeatureData(uniqueTitle);

    const contentHash = hashString(
      `${featureTitle}|${featureDescription}|${selectedUnified}|${JSON.stringify(
        featureData
      )}`
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

    if (clearAfterSave) {
      clearAllShapes();
    }

    resetForm();
    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
  };

  const handleDownload = () => {
    if (shapes.length === 0) return;

    const baseTitle = title.trim() || "Messung";
    const { featureData, featureTitle } = buildFeatureData(baseTitle);

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

    if (clearAfterSave) {
      clearAllShapes();
    }

    resetForm();
    dispatch(setActiveInteractionLayerID(null));
  };

  const emojiPicker = (
    <Picker
      data={emojiData}
      i18n={i18nDe}
      set="twitter"
      theme="light"
      previewPosition="none"
      skinTonePosition="none"
      maxFrequentRows={1}
      perLine={8}
      emojiButtonSize={32}
      emojiSize={22}
      onEmojiSelect={handleEmojiSelect}
    />
  );

  return (
    <div className="bg-white button-shadow rounded-xl p-4 flex flex-col gap-3 w-[500px]">
      <div className="flex items-center gap-2">
        <h4 className="mb-0">Messungen speichern</h4>
      </div>
      <hr className="my-0" />
      <label htmlFor="measurement-title" className="-mb-1 font-semibold">
        Titel
      </label>
      <div className="flex items-center gap-2">
        <Popover
          open={emojiPickerOpen}
          onOpenChange={setEmojiPickerOpen}
          trigger="click"
          placement="bottomLeft"
          destroyTooltipOnHide
          content={emojiPicker}
          overlayInnerStyle={{ padding: 0, background: "transparent" }}
        >
          <button
            type="button"
            title="Emoji wählen"
            className="flex items-center justify-center shrink-0 h-8 w-10 rounded-md border border-gray-300 bg-white hover:border-gray-400 cursor-pointer"
          >
            <img
              src={twemojiUrl(selectedUnified)}
              alt=""
              className="w-5 h-5"
              draggable={false}
            />
          </button>
        </Popover>
        <Input
          id="measurement-title"
          value={title}
          className="bg-white flex-1"
          placeholder="Bezeichnung der Messungen?"
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={handleSave}
        />
      </div>
      <label htmlFor="measurement-description" className="-mb-1 font-semibold">
        Inhalt
      </label>
      <Input.TextArea
        id="measurement-description"
        value={description}
        className="bg-white"
        placeholder="Was wurde gemessen?"
        onChange={(e) => setDescription(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
      />
      <Checkbox
        checked={clearAfterSave}
        onChange={(e) => setClearAfterSave(e.target.checked)}
      >
        Messungen nach dem Speichern entfernen
      </Checkbox>
      <div className="flex gap-2">
        <Button
          disabled={shapes.length === 0}
          onClick={handleSave}
          className="flex-1"
        >
          Im Portal speichern
        </Button>
        <Button
          disabled={shapes.length === 0}
          onClick={handleDownload}
          className="flex-1"
        >
          Datei speichern
        </Button>
      </div>
    </div>
  );
}

export default SaveMeasurements;
