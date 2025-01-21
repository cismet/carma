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

const BaseLayerSelection = () => {
  const dispatch = useDispatch();
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);

  const handleRadioClick = (e) => {
    if (backgroundLayer.id !== "karte") {
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
        className="pb-2"
        optionType="default"
        style={{ filter: backgroundLayer.id !== "karte" ? "saturate(0)" : "" }}
      >
        <Radio onClick={handleRadioClick} value="stadtplan">
          Stadtplan
        </Radio>
        <Radio onClick={handleRadioClick} value="gelaende">
          Gelände
        </Radio>
        <Radio onClick={handleRadioClick} value="amtlich">
          Amtliche Geobasisdaten
        </Radio>
      </Radio.Group>
    </LayerSelection>
  );
};

export default BaseLayerSelection;
