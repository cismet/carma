import { useState } from "react";
import { nanoid } from "@reduxjs/toolkit";

import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Input, Tooltip, message } from "antd";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import type { BackgroundLayer, Layer } from "@carma/types";
import type { GeoportalCollection } from "../types";

interface SaveProps {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  storeConfigAction: (config: GeoportalCollection) => void;
  closePopover?: () => void;
}

export const Save = ({
  layers,
  backgroundLayer,
  storeConfigAction,
  closePopover,
}: SaveProps) => {
  const [messageApi, contextHolder] = message.useMessage();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnail, setThumbnail] = useState("");

  const resetStates = () => {
    setTitle("");
    setDescription("");
    setThumbnail("");
  };

  const handleOnClick = () => {
    const config: GeoportalCollection = {
      title,
      description,
      type: "collection",
      layers,
      backgroundLayer,
      thumbnail,
      id: nanoid(),
      serviceName: "collections",
    };
    try {
      storeConfigAction(config);
      resetStates();
      messageApi.open({
        type: "success",
        content: `Karte "${title}" wurde erfolgreich gespeichert.`,
      });
    } catch (e) {
      messageApi.open({
        type: "error",
        content: "Es gab einen Fehler beim speichern der Karte",
      });
    }
    closePopover?.();
  };

  return (
    <div className="p-2 flex flex-col gap-3 w-[460px]">
      {contextHolder}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faFileExport} className="text-xl" />
        <h4 className="mb-0">Karte speichern</h4>
      </div>
      <hr className="my-0" />
      <label htmlFor="title" className="-mb-1 font-semibold">
        Titel
      </label>
      <Input
        id="title"
        value={title}
        className="bg-white"
        placeholder="Unter welchem Namen soll die Karte gespeichert werden?"
        onChange={(e) => setTitle(e.target.value)}
      />
      <label htmlFor="description" className="-mb-1 font-semibold">
        Inhalt
      </label>
      <Input.TextArea
        id="description"
        value={description}
        className="bg-white"
        placeholder="Welche Kartenebenen und/oder Objektkategorien umfasst die Karte? Welche Hintergrundkarte wird verwendet?"
        onChange={(e) => setDescription(e.target.value)}
      />

      <Button onClick={handleOnClick}>Als Favorit speichern</Button>
    </div>
  );
};

export default Save;
