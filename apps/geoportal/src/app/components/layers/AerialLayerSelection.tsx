import { useDispatch, useSelector } from "react-redux";
import {
  getSelectedLuftbildLayer,
  setBackgroundLayer,
  setSelectedLuftbildLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { layerMap } from "../../config";
import LayerSelection from "./LayerSelection";

const AerialLayerSelection = () => {
  const dispatch = useDispatch();

  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);

  return (
    <LayerSelection
      id="luftbild"
      title="Luftbild"
      selectedLayer={{ ...selectedLuftbildLayer, id: "luftbild" }}
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
        className="pb-2"
        optionType="default"
      >
        <Radio value="luftbild">Luftbildkarte 03/24</Radio>
        <Radio value="luftbild21">Luftbildkarte 06/21</Radio>
      </Radio.Group>
    </LayerSelection>
  );
};

export default AerialLayerSelection;
