import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getSelectedLuftbildLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { backgroundLayerCatalog, cesiumBackgroundlayerNames } from "../../config";
import LayerSelection from "./LayerSelection";
import { useState } from "react";
import { useMapStyle } from "@carma-appframeworks/portals";
import { applyBackgroundLayer } from "../../helper/layer";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

const luftbildEntries = backgroundLayerCatalog.filter(
  (entry) => entry.group === "luftbild"
);

const AerialLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedLuftbildLayer = useSelector(getSelectedLuftbildLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { isLeaflet } = useMapFrameworkSwitcherContext();

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
            const entry = luftbildEntries.find((it) => it.id === e.target.value);
            if (entry) {
              applyBackgroundLayer(dispatch, setCurrentStyle, entry);
            }
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
          {luftbildEntries.map((entry) => (
            <Radio
              key={entry.id}
              value={entry.id}
              className="text-left"
              onClick={() => {
                if (backgroundLayer.id !== "luftbild") {
                  applyBackgroundLayer(dispatch, setCurrentStyle, entry);
                }
              }}
            >
              {entry.title}
            </Radio>
          ))}
        </Radio.Group>
      )}
    </LayerSelection>
  );
};

export default AerialLayerSelection;
