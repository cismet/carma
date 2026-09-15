import type { BackgroundLayer } from "@carma-mapping/layers";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  backgroundConfig,
  toBackgroundLayer,
} from "../config/backgroundConfig";
import {
  getBackgroundLayer,
  getSelectedByCategory,
  setBackgroundLayer,
  setSelectedByCategory,
} from "../store/slices/mapping";

/**
 * Refreshes the restored background selection against the current background
 * config on boot: the persisted entries carry the texts and layer strings of
 * the release that wrote them. A stored choice the config no longer knows, or
 * a category the store has no choice for yet, falls back to the category
 * default; a stored category the config no longer has falls back to the
 * default category.
 */
export const useManageLayers = () => {
  const dispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedByCategory = useSelector(getSelectedByCategory);

  useEffect(() => {
    const refreshed: Record<string, BackgroundLayer> = {};

    for (const category of backgroundConfig.categories) {
      const stored = selectedByCategory[category.id];
      const id =
        stored && category.entries.includes(stored.id)
          ? stored.id
          : category.defaultEntry ?? category.entries[0];
      const layer = toBackgroundLayer(id, {
        opacity: stored?.opacity,
        visible: stored?.visible,
      });
      refreshed[category.id] = layer;
      dispatch(setSelectedByCategory({ categoryId: category.id, layer }));
    }

    const active =
      refreshed[backgroundLayer.id] ??
      refreshed[backgroundConfig.defaultCategory];
    dispatch(
      setBackgroundLayer({
        ...backgroundLayer,
        ...active,
        id: refreshed[backgroundLayer.id]
          ? backgroundLayer.id
          : backgroundConfig.defaultCategory,
        opacity: backgroundLayer.opacity,
        visible: backgroundLayer.visible,
      })
    );
    // boot only: the config is fixed for the page's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);
};
