import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Radio } from "antd";

import { MapStyleKeys } from "@carma-appframeworks/portals";
import { useMapStyle } from "../../hooks/useGeoportalMapStyle";

import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
  setBackgroundLayer,
  setSelectedLuftbildLayer,
} from "../../store/slices/mapping";

import { layerMap } from "../../config";
import LayerSelection from "./LayerSelection";
import { createBackgroundLayerConfig } from "../../helper/layer";

const AerialLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const handleRadioClick = (e) => {
    if (backgroundLayer.id !== MapStyleKeys.AERIAL) {
      setCurrentStyle(MapStyleKeys.AERIAL);
      dispatch(
        setBackgroundLayer({
          id: MapStyleKeys.AERIAL,
          title: layerMap[e.target.value].title,
          opacity: 1.0,
          description: layerMap[e.target.value].description,
          inhalt: layerMap[e.target.value].inhalt,
          eignung: layerMap[e.target.value].eignung,
          layerType: "wmts",
          visible: true,
          props: {
            name: "",
            url: layerMap[e.target.value].url,
          },
          layers: layerMap[e.target.value].layers,
        })
      );
    }
  };

  return (
    <LayerSelection
      id={MapStyleKeys.AERIAL}
      title="Luftbild"
      selectedLayer={{ ...selectedLuftbildLayer, id: MapStyleKeys.AERIAL }}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      <Radio.Group
        value={selectedLuftbildLayer.id}
        onChange={(e) => {
          const config = createBackgroundLayerConfig(e.target.value);
          dispatch(setSelectedLuftbildLayer(config));

          dispatch(
            setBackgroundLayer({
              ...config,
              id: MapStyleKeys.AERIAL,
            })
          );
        }}
        className="pb-2 px-2"
        optionType="default"
        style={{
          filter:
            backgroundLayer.id !== MapStyleKeys.AERIAL && !hovered
              ? "saturate(0)"
              : "",
        }}
      >
        <Radio
          onClick={handleRadioClick}
          value={MapStyleKeys.AERIAL}
          className="text-left"
        >
          Luftbildkarte 03/24
        </Radio>
        <Radio
          onClick={handleRadioClick}
          value="luftbild21"
          className="text-left"
        >
          Luftbildkarte 06/21
        </Radio>
      </Radio.Group>
    </LayerSelection>
  );
};

export default AerialLayerSelection;
