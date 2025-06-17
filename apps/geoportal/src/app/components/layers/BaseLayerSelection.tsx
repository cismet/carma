import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setSelectedMapLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { layerMap } from "../../config";
import LayerSelection from "./LayerSelection";
import { useState } from "react";
import { useMapStyle } from "@carma-apps/portals";
import { MapStyleKeys } from "../../constants/MapStyleKeys";

const BaseLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const handleRadioClick = (e) => {
    if (backgroundLayer.id !== "karte") {
      setCurrentStyle(MapStyleKeys.TOPO);
      dispatch(
        setBackgroundLayer({
          id: "karte",
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
      id="karte"
      title="Karte"
      selectedLayer={{ ...selectedMapLayer, id: "karte" }}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      <Radio.Group
        value={selectedMapLayer.id}
        onChange={(e) => {
          dispatch(
            setSelectedMapLayer({
              id: e.target.value,
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

          dispatch(
            setBackgroundLayer({
              id: "karte",
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
        }}
        className="pb-2 flex flex-col px-2 min-[686px]:inline-block"
        optionType="default"
        style={{
          filter:
            backgroundLayer.id !== "karte" && !hovered ? "saturate(0)" : "",
        }}
      >
        <Radio
          onClick={handleRadioClick}
          value="stadtplan"
          className="text-left"
        >
          Stadtplan
        </Radio>
        <Radio
          onClick={handleRadioClick}
          value="gelaende"
          className="text-left"
        >
          Gelände
        </Radio>
        <Radio onClick={handleRadioClick} value="amtlich" className="text-left">
          Amtliche Basiskarte
        </Radio>
      </Radio.Group>
    </LayerSelection>
  );
};

export default BaseLayerSelection;
