import { LayerMap } from "@carma-appframeworks/portals";
import type { BackgroundLayer } from "@carma-mapping/layers";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import { geoportalBackgroundConfig } from "../config/backgroundConfig";
import {
  getBackgroundLayer,
  getSelectedByCategory,
  setBackgroundLayer,
  setSelectedByCategory,
} from "../store/slices/mapping";

/**
 * Refreshes the restored background selection against the current layerMap on
 * boot: the persisted entries carry the texts and layer strings of the release
 * that wrote them. A stored choice the app no longer knows, or a category the
 * store has no choice for yet, falls back to the category default.
 */
export const useManageLayers = (layerMap: LayerMap) => {
  const dispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedByCategory = useSelector(getSelectedByCategory);

  useEffect(() => {
    const refreshed: Record<string, BackgroundLayer> = {};

    for (const category of geoportalBackgroundConfig.categories) {
      const stored = selectedByCategory[category.id];
      const id =
        stored && layerMap[stored.id]
          ? stored.id
          : category.defaultEntry ?? category.entries[0];
      const layer: BackgroundLayer = {
        title: layerMap[id].title,
        id,
        opacity: stored?.opacity ?? 1.0,
        description: layerMap[id].description,
        inhalt: layerMap[id].inhalt,
        eignung: layerMap[id].eignung,
        visible: stored?.visible ?? true,
        layerType: "wmts",
        layers: layerMap[id].layers,
      };
      refreshed[category.id] = layer;
      dispatch(setSelectedByCategory({ categoryId: category.id, layer }));
    }

    const active =
      refreshed[backgroundLayer.id] ??
      refreshed[geoportalBackgroundConfig.defaultCategory];
    dispatch(
      setBackgroundLayer({
        ...backgroundLayer,
        ...active,
        id: refreshed[backgroundLayer.id]
          ? backgroundLayer.id
          : geoportalBackgroundConfig.defaultCategory,
        opacity: backgroundLayer.opacity,
        visible: backgroundLayer.visible,
      })
    );
  }, [dispatch, layerMap]);
};
