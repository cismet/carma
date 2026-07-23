import { useDispatch, useSelector } from "react-redux";
import {
  getBackgroundLayer,
  getSelectedMapLayer,
} from "../../store/slices/mapping";
import { Radio } from "antd";
import { backgroundLayerCatalog, cesiumBackgroundlayerNames } from "../../config";
import LayerSelection from "./LayerSelection";
import { useState } from "react";
import { useMapStyle } from "@carma-appframeworks/portals";
import { applyBackgroundLayer } from "../../helper/layer";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

const karteEntries = backgroundLayerCatalog.filter(
  (entry) => entry.group === "karte"
);

const BaseLayerSelection = () => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selectedMapLayer = useSelector(getSelectedMapLayer);
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { isLeaflet } = useMapFrameworkSwitcherContext();

  return (
    <LayerSelection
      id="karte"
      title={isLeaflet ? "Karte" : cesiumBackgroundlayerNames.karte}
      selectedLayer={{ ...selectedMapLayer, id: "karte" }}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      {isLeaflet && (
        <Radio.Group
          value={selectedMapLayer.id}
          onChange={(e) => {
            const entry = karteEntries.find((it) => it.id === e.target.value);
            if (entry) {
              applyBackgroundLayer(dispatch, setCurrentStyle, entry);
            }
          }}
          className="pb-2 flex flex-col px-2 min-[686px]:inline-block"
          optionType="default"
          style={{
            filter:
              backgroundLayer.id !== "karte" && !hovered ? "saturate(0)" : "",
          }}
        >
          {karteEntries.map((entry) => (
            <Radio
              key={entry.id}
              value={entry.id}
              className="text-left"
              onClick={() => {
                if (backgroundLayer.id !== "karte") {
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

export default BaseLayerSelection;
