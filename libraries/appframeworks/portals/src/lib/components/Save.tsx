import { useState } from "react";
import { nanoid } from "@reduxjs/toolkit";

import { faFileExport } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Input, Tooltip, message } from "antd";
import { faQuestionCircle } from "@fortawesome/free-regular-svg-icons";
import type { BackgroundLayer, Layer } from "@carma-commons/types";
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
    <div className="p-2 flex flex-col gap-3 w-96">
      {contextHolder}
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faFileExport} className="text-xl" />
        <h4 className="mb-0">Karte speichern</h4>
      </div>
      <hr className="my-0" />
      <h5 className="mb-0">Bezeichnung</h5>
      <Input
        id="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <h5 className="mb-0">Beschreibung</h5>
      <Input.TextArea
        id="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-1 -mb-2 font-medium items-center">
        <h5 className="mb-0">Vorschaubild</h5>
        <Tooltip
          placement="bottom"
          title="Das Vorschaubild wird automatisch generiert, wenn keine URL angegeben wird."
          arrow={false}
          trigger={["hover", "click"]}
        >
          <FontAwesomeIcon icon={faQuestionCircle} className="text-sm" />
        </Tooltip>
      </div>
      <Input
        id="thumbnail"
        value={thumbnail}
        placeholder="Adresse (URL)"
        onChange={(e) => setThumbnail(e.target.value)}
      />

      <Button onClick={handleOnClick}>Als Favorit speichern</Button>
    </div>
  );
};

export default Save;
