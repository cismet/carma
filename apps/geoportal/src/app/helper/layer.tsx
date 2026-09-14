import { layerMap } from "../config";
import { BackgroundLayer } from "@carma-mapping/layers";
import type { BackgroundLayerCatalogEntry } from "@carma-appframeworks/portals";
import type { AppDispatch } from "../store";
import {
  setBackgroundLayer,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../store/slices/mapping";

export const createBackgroundLayerConfig = (
  id: string,
  opacity?: number
): BackgroundLayer => {
  return {
    id,
    title: layerMap[id].title,
    opacity: opacity || 1.0,
    description: layerMap[id].description,
    inhalt: layerMap[id].inhalt,
    eignung: layerMap[id].eignung,
    layerType: "wmts",
    visible: true,
    layers: layerMap[id].layers,
  };
};

export const applyBackgroundLayer = (
  dispatch: AppDispatch,
  setCurrentStyle: (style: string) => void,
  entry: BackgroundLayerCatalogEntry
): void => {
  dispatch(
    entry.group === "luftbild"
      ? setSelectedLuftbildLayer(entry.config)
      : setSelectedMapLayer(entry.config)
  );
  dispatch(setBackgroundLayer({ ...entry.config, id: entry.group }));
  setCurrentStyle(entry.style);
};
