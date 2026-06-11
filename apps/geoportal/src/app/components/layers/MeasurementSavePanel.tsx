import { useState } from "react";
import { Button, Checkbox, Input, Popover } from "antd";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data/sets/15/twitter.json";
import i18nDe from "@emoji-mart/data/i18n/de.json";

import { twemojiUrl } from "@carma-mapping/utils";

import {
  DEFAULT_MEASUREMENT_EMOJI_UNIFIED,
  type MeasurementSaveValues,
} from "./measurement-save-utils";

const strings = {
  title: "Messungen speichern",
  titleLabel: "Titel",
  titlePlaceholder: "Bezeichnung der Messungen?",
  descriptionLabel: "Inhalt",
  descriptionPlaceholder: "Was wurde gemessen?",
  emojiPickerTitle: "Emoji wählen",
  clearAfterSaveLabel: "Messungen nach dem Speichern entfernen",
  portalSaveButton: "Im Portal speichern",
  fileSaveButton: "Datei speichern",
} as const;

type PickedEmoji = {
  native: string;
  unified: string;
  id: string;
};

type MeasurementSavePanelProps = {
  disabled: boolean;
  onPortalSave: (values: MeasurementSaveValues) => void | Promise<void>;
  onFileSave: (values: MeasurementSaveValues) => void | Promise<void>;
};

const MeasurementSavePanel = ({
  disabled,
  onPortalSave,
  onFileSave,
}: MeasurementSavePanelProps) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUnified, setSelectedUnified] = useState<string>(
    DEFAULT_MEASUREMENT_EMOJI_UNIFIED
  );
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [clearAfterSave, setClearAfterSave] = useState(false);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setSelectedUnified(DEFAULT_MEASUREMENT_EMOJI_UNIFIED);
    setClearAfterSave(false);
  };

  const handleEmojiSelect = (emoji: PickedEmoji) => {
    setSelectedUnified(emoji.unified);
    setEmojiPickerOpen(false);
  };

  const buildValues = (): MeasurementSaveValues => ({
    title,
    description,
    selectedUnified,
    clearAfterSave,
  });

  const submit = async (
    handler: (values: MeasurementSaveValues) => void | Promise<void>
  ) => {
    if (disabled) {
      return;
    }

    await handler(buildValues());
    resetForm();
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
        <h4 className="mb-0">{strings.title}</h4>
      </div>
      <hr className="my-0" />
      <label htmlFor="measurement-title" className="-mb-1 font-semibold">
        {strings.titleLabel}
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
            title={strings.emojiPickerTitle}
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
          placeholder={strings.titlePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={() => void submit(onPortalSave)}
        />
      </div>
      <label htmlFor="measurement-description" className="-mb-1 font-semibold">
        {strings.descriptionLabel}
      </label>
      <Input.TextArea
        id="measurement-description"
        value={description}
        className="bg-white"
        placeholder={strings.descriptionPlaceholder}
        onChange={(e) => setDescription(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 4 }}
      />
      <Checkbox
        checked={clearAfterSave}
        onChange={(e) => setClearAfterSave(e.target.checked)}
      >
        {strings.clearAfterSaveLabel}
      </Checkbox>
      <div className="flex gap-2">
        <Button
          disabled={disabled}
          onClick={() => void submit(onPortalSave)}
          className="flex-1"
        >
          {strings.portalSaveButton}
        </Button>
        <Button
          disabled={disabled}
          onClick={() => void submit(onFileSave)}
          className="flex-1"
        >
          {strings.fileSaveButton}
        </Button>
      </div>
    </div>
  );
};

export default MeasurementSavePanel;
