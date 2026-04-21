import { useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Checkbox, Input, Popover } from "antd";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data/sets/15/twitter.json";
import i18nDe from "@emoji-mart/data/i18n/de.json";

import {
  appendLayer,
  setActiveInteractionLayerID,
} from "../../store/slices/mapping";
import { setUIMode, UIMode } from "../../store/slices/ui";
import {
  useMapMeasurementsContext,
  shapesToFeatureCollection,
} from "@carma-commons/measurements";
import type { Layer } from "@carma-mapping/layers";
import { parseToMapLayer, twemojiUrl } from "@carma-mapping/utils";

const DEFAULT_EMOJI_UNIFIED = "1f4cf";

type PickedEmoji = {
  native: string;
  unified: string;
  id: string;
};

function SaveMeasurements({ layer }: { layer: Layer }) {
  const dispatch = useDispatch();
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

  const handleSave = async () => {
    if (shapes.length === 0) return;

    const featureData = shapesToFeatureCollection(shapes);
    const featureTitle = title.trim() || "Messung";
    const trimmedDescription = description.trim();
    const featureDescription = trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "";

    featureData.metadata.carmaConf.layerInfo.title = featureTitle;
    featureData.metadata.carmaConf.layerInfo.icon = `emoji:${selectedUnified}`;

    const featureId = `measurement-${Date.now()}`;
    const carmaConf = featureData.metadata?.carmaConf;

    let item: any = {
      description: featureDescription,
      id: featureId,
      layerType: "vector",
      title: featureTitle,
      serviceName: "custom",
      type: "layer",
      keywords: [`carmaConf://vectorStyle:${JSON.stringify(featureData)}`],
    };

    if (carmaConf?.layerInfo) {
      item = {
        ...item,
        ...carmaConf.layerInfo,
        title: featureTitle,
        description: featureDescription,
        keywords: [...item.keywords, ...(carmaConf.layerInfo.keywords || [])],
      };
    }

    const parsedLayer = await parseToMapLayer(item, false, true);

    if (parsedLayer) {
      dispatch(appendLayer(parsedLayer));
    }

    if (clearAfterSave) {
      clearAllShapes();
    }

    setTitle("");
    setDescription("");
    setSelectedUnified(DEFAULT_EMOJI_UNIFIED);
    setClearAfterSave(false);
    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
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
        <h4 className="mb-0">Messung speichern</h4>
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
          placeholder="Unter welchem Namen soll die Messung gespeichert werden?"
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
        placeholder="Was enthalten die Messungen?"
        onChange={(e) => setDescription(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
      />
      <Checkbox
        checked={clearAfterSave}
        onChange={(e) => setClearAfterSave(e.target.checked)}
      >
        Messungen nach dem Speichern löschen
      </Checkbox>
      <Button disabled={shapes.length === 0} onClick={handleSave}>
        Messung speichern
      </Button>
    </div>
  );
}

export default SaveMeasurements;
