import { useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Radio } from "antd";

import { useMapStyle } from "@carma-appframeworks/portals";
import { cn } from "@carma-commons/utils";

import { backgroundLayerCatalog } from "../../config";
import {
  backgroundConfig,
  getBackgroundCategoryTitle,
} from "../../config/backgroundConfig";
import type { BackgroundCategory } from "../../config/geoportalBackground";
import { applyBackgroundLayer } from "../../helper/layer";
import {
  getBackgroundLayer,
  getSelected3dByCategory,
  getSelectedByCategory,
  setSelected3dByCategory,
} from "../../store/slices/mapping";
import LayerSelection from "./LayerSelection";
import { useIs3dView } from "../../hooks/useIs3dView";

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
  const is3dView = useIs3dView();
  const isActive = backgroundLayer.id === category.id;

  const entries = useMemo(
    () => backgroundLayerCatalog.filter((entry) => entry.group === category.id),
    [category.id]
  );
  const selected3d = useSelector(getSelected3dByCategory)[category.id] ?? 0;
  const libre3d = is3dView ? category.libre3d : undefined;
  // radio values are strings, a 3D option is known by its index
  const options = libre3d
    ? libre3d.map((option, index) => ({
        id: String(index),
        title:
          option.title ??
          (option.base && backgroundConfig.layerMap[option.base]?.title) ??
          getBackgroundCategoryTitle(category, false),
      }))
    : entries;

  const pick = (id: string) => {
    let entryId = id;
    if (libre3d) {
      dispatch(
        setSelected3dByCategory({ categoryId: category.id, index: Number(id) })
      );
      if (isActive) {
        return;
      }
      // the 3D pick belongs to the category, so the category must become active
      entryId = selected?.id ?? entries[0].id;
    }
    const entry = entries.find((it) => it.id === entryId);
    if (entry) {
      applyBackgroundLayer(dispatch, setCurrentStyle, entry);
    }
  };

  return (
    <LayerSelection
      id={category.id}
      title={getBackgroundCategoryTitle(category, !is3dView)}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => {
        setHovered(false);
      }}
    >
      {(!is3dView || (libre3d && libre3d.length > 1)) && (
        <Radio.Group
          value={libre3d ? String(selected3d) : selected?.id}
          onChange={(e) => {
            pick(e.target.value);
          }}
          className={cn(
            "pb-2 px-2 flex",
            libre3d ? "flex-row justify-center" : "flex-col",
            // more than two entries: two aligned columns instead of a
            // centered inline flow, whose rows would not line up
            options.length > 2 &&
              "min-[686px]:grid min-[686px]:grid-cols-[auto_auto] min-[686px]:w-fit min-[686px]:mx-auto min-[686px]:justify-items-start",
            // an odd last entry spans the row and sits in the middle
            options.length > 2 &&
              "min-[686px]:[&>:last-child:nth-child(odd)]:col-span-2 min-[686px]:[&>:last-child:nth-child(odd)]:justify-self-center"
          )}
          optionType="default"
          style={{
            filter: !isActive && !hovered ? "saturate(0)" : "",
          }}
        >
          {options.map((entry) => (
            <Radio
              key={entry.id}
              value={entry.id}
              className="text-left whitespace-nowrap"
              onClick={() => {
                // clicking the already checked entry of an inactive category
                // fires no change event, but still means "show this one"
                if (!isActive) {
                  pick(entry.id);
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
