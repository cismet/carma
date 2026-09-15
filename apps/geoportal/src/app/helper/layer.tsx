import type { BackgroundLayerCatalogEntry } from "@carma-appframeworks/portals";
import type { AppDispatch } from "../store";
import {
  setBackgroundLayer,
  setSelectedByCategory,
} from "../store/slices/mapping";

export const applyBackgroundLayer = (
  dispatch: AppDispatch,
  setCurrentStyle: (style: string) => void,
  entry: BackgroundLayerCatalogEntry
): void => {
  dispatch(
    setSelectedByCategory({ categoryId: entry.group, layer: entry.config })
  );
  dispatch(setBackgroundLayer({ ...entry.config, id: entry.group }));
  setCurrentStyle(entry.style);
};
