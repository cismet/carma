import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
  setBackgroundLayer,
  setSelectedLuftbildLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { layerMap } from "../../config";
import LayerSelection from "./LayerSelection";
import { useState } from "react";
import { useMapStyle } from "@carma-apps/portals";
import { MapStyleKeys } from "../../constants/MapStyleKeys";

const AerialLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const handleRadioClick = (e) => {
    if (backgroundLayer.id !== "luftbild") {
      setCurrentStyle(MapStyleKeys.AERIAL);
      dispatch(
        setBackgroundLayer({
          id: "luftbild",
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
      id="luftbild"
      title="Luftbild"
      selectedLayer={{ ...selectedLuftbildLayer, id: "luftbild" }}
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
          dispatch(
            setSelectedLuftbildLayer({
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
              id: "luftbild",
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
        className="pb-2 px-2"
        optionType="default"
        style={{
          filter:
            backgroundLayer.id !== "luftbild" && !hovered ? "saturate(0)" : "",
        }}
      >
        <Radio
          onClick={handleRadioClick}
          value="luftbild"
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
