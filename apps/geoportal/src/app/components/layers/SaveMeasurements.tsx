import { useState } from "react";
import { useDispatch } from "react-redux";
import { Button, Input } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { iconMap } from "@carma-mapping/components";

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
import { parseToMapLayer } from "@carma-mapping/utils";

const iconKeys = Object.keys(iconMap) as (keyof typeof iconMap)[];

function SaveMeasurements({ layer }: { layer: Layer }) {
  const dispatch = useDispatch();
  const { shapes } = useMapMeasurementsContext();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<keyof typeof iconMap>(
    iconKeys[0]
  );

  const handleSave = async () => {
    if (shapes.length === 0) return;

    const featureData = shapesToFeatureCollection(shapes);
    const featureTitle = title.trim() || "Messung";
    const trimmedDescription = description.trim();
    const featureDescription = trimmedDescription
      ? `Inhalt: ${trimmedDescription}`
      : "";

    featureData.metadata.carmaConf.layerInfo.title = featureTitle;
    featureData.metadata.carmaConf.layerInfo.icon = selectedIcon;

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

    setTitle("");
    setDescription("");
    setSelectedIcon(iconKeys[0]);
    dispatch(setActiveInteractionLayerID(null));
    dispatch(setUIMode(UIMode.DEFAULT));
  };

  return (
    <div className="bg-white button-shadow rounded-xl p-4 flex flex-col gap-3 w-[460px]">
      <div className="flex items-center gap-2">
        <h4 className="mb-0">Messung speichern</h4>
      </div>
      <hr className="my-0" />
      <label htmlFor="measurement-title" className="-mb-1 font-semibold">
        Titel
      </label>
      <Input
        id="measurement-title"
        value={title}
        className="bg-white"
        placeholder="Unter welchem Namen soll die Messung gespeichert werden?"
        onChange={(e) => setTitle(e.target.value)}
        onPressEnter={handleSave}
      />
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
      <label className="-mb-1 font-semibold">Icon</label>
      <div className="grid grid-cols-8 gap-1.5">
        {iconKeys.map((key) => (
          <button
            key={key}
            onClick={() => setSelectedIcon(key)}
            title={key}
            className={`
              flex items-center justify-center h-9 rounded-md
              transition-all cursor-pointer border bg-white
              ${
                selectedIcon === key
                  ? "border-blue-400 text-blue-600 shadow-sm ring-2 ring-blue-100"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }
            `}
          >
            <FontAwesomeIcon icon={iconMap[key]} className="text-sm" />
          </button>
        ))}
      </div>
      <Button disabled={shapes.length === 0} onClick={handleSave}>
        Messung speichern
      </Button>
    </div>
  );
}

export default SaveMeasurements;
