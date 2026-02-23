import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
  setBackgroundLayer,
  setSelectedLuftbildLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { cesiumBackgroundlayerNames, layerMap } from "../../config";
import LayerSelection from "./LayerSelection";
import { useState } from "react";
import { useMapStyle } from "@carma-appframeworks/portals";
import { MapStyleKeys } from "../../constants/MapStyleKeys";
import { createBackgroundLayerConfig } from "../../helper/layer";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

const AerialLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { isLeaflet } = useMapFrameworkSwitcherContext();

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
          layers: layerMap[e.target.value].layers,
        })
      );
    }
  };

  return (
    <LayerSelection
      id="luftbild"
      title={isLeaflet ? "Luftbild" : cesiumBackgroundlayerNames.luftbild}
      selectedLayer={{ ...selectedLuftbildLayer, id: "luftbild" }}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      {isLeaflet && (
        <Radio.Group
          value={selectedLuftbildLayer.id}
          onChange={(e) => {
            const config = createBackgroundLayerConfig(e.target.value);
            dispatch(setSelectedLuftbildLayer(config));

            dispatch(
              setBackgroundLayer({
                ...config,
                id: "luftbild",
              })
            );
          }}
          className="pb-2 px-2"
          optionType="default"
          style={{
            filter:
              backgroundLayer.id !== "luftbild" && !hovered
                ? "saturate(0)"
                : "",
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
      )}
    </LayerSelection>
  );
};

export default AerialLayerSelection;
