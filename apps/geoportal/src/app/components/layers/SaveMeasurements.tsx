import { Button, Checkbox, Input, Popover } from "antd";
import Picker from "@emoji-mart/react";
import emojiData from "@emoji-mart/data/sets/15/twitter.json";
import i18nDe from "@emoji-mart/data/i18n/de.json";

import { ResponsiveInfoBox } from "@carma-appframeworks/portals";
import type { Layer } from "@carma-mapping/layers";
import { twemojiUrl } from "@carma-mapping/utils";

import { useSaveMeasurementsForm } from "../../hooks/use-save-measurements-form";

function SaveMeasurements({ layer: _layer }: { layer: Layer }) {
  const {
    clearAfterSave,
    description,
    emojiPickerOpen,
    handleDownload,
    handleEmojiSelect,
    handleSave,
    hasShapes,
    infoBoxHeaderColor,
    selectedUnified,
    setClearAfterSave,
    setDescription,
    setEmojiPickerOpen,
    setTitle,
    title,
  } = useSaveMeasurementsForm();

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
    <ResponsiveInfoBox
      panelClick={(event) => event.stopPropagation()}
      pixelwidth={500}
      isCollapsible={false}
      fixedRow={false}
      header={
        <div className="w-full" style={{ backgroundColor: infoBoxHeaderColor }}>
          Messungen speichern
        </div>
      }
      alwaysVisibleDiv={
        <div className="flex flex-col gap-3 p-3">
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
          <label
            htmlFor="measurement-description"
            className="-mb-1 font-semibold"
          >
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
            Messungen nach dem Speichern löschen
          </Checkbox>
          <div className="flex gap-2">
            <Button
              disabled={!hasShapes}
              onClick={handleSave}
              className="flex-1"
            >
              Zum Geoportal hinzufügen
            </Button>
            <Button
              disabled={!hasShapes}
              onClick={handleDownload}
              className="flex-1"
            >
              Speichern
            </Button>
          </div>
        </div>
      }
      collapsibleDiv={<div />}
    />
  );
}

export default SaveMeasurements;
