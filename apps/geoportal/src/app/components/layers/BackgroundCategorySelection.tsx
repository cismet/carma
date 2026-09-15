import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Radio } from "antd";

import { useMapStyle } from "@carma-appframeworks/portals";
import { useMapFrameworkSwitcherContext } from "@carma-mapping/components";

import { backgroundLayerCatalog } from "../../config";
import { getBackgroundCategoryTitle } from "../../config/backgroundConfig";
import type { BackgroundCategory } from "../../config/geoportalBackground";
import { applyBackgroundLayer } from "../../helper/layer";
import {
  getBackgroundLayer,
  getSelectedByCategory,
} from "../../store/slices/mapping";
import LayerSelection from "./LayerSelection";

interface BackgroundCategorySelectionProps {
  category: BackgroundCategory;
}

/** one column of the base map switch: the category and its base maps */
const BackgroundCategorySelection = ({
  category,
}: BackgroundCategorySelectionProps) => {
  const [hovered, setHovered] = useState(false);
  const dispatch = useDispatch();

  const { setCurrentStyle } = useMapStyle();
  const selected = useSelector(getSelectedByCategory)[category.id];
  const backgroundLayer = useSelector(getBackgroundLayer);
  const { isLeaflet } = useMapFrameworkSwitcherContext();
  const isActive = backgroundLayer.id === category.id;

  const entries = useMemo(
    () => backgroundLayerCatalog.filter((entry) => entry.group === category.id),
    [category.id]
  );

  return (
    <LayerSelection
      id={category.id}
      title={getBackgroundCategoryTitle(category, isLeaflet)}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      {isLeaflet && (
        <Radio.Group
          value={selected?.id}
          onChange={(e) => {
            const entry = entries.find((it) => it.id === e.target.value);
            if (entry) {
              applyBackgroundLayer(dispatch, setCurrentStyle, entry);
            }
          }}
          className="pb-2 flex flex-col px-2 min-[686px]:inline-block"
          optionType="default"
          style={{
            filter: !isActive && !hovered ? "saturate(0)" : "",
          }}
        >
          {entries.map((entry) => (
            <Radio
              key={entry.id}
              value={entry.id}
              className="text-left"
              onClick={() => {
                // clicking the already checked entry of an inactive category
                // fires no change event, but still means "show this one"
                if (!isActive) {
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

export default BackgroundCategorySelection;
