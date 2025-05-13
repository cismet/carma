import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  type LayerMap,
  type SelectionItem,
  type Settings,
} from "@carma-apps/portals";
import type { BackgroundLayer, Layer } from "@carma-commons/types";

import {
  setBackgroundLayer,
  setConfigSelection,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../store/slices/mapping";

import { AppDispatch } from "../store";
import {
  deleteHashParamsFromHistoryState,
  getHashParams,
} from "@carma-commons/utils";

type View = {
  center: string[];
  zoom: string;
};

type Config = {
  layers: Layer[];
  backgroundLayer: BackgroundLayer & { selectedLayerId: string };
  settings?: Settings;
  view?: View;
  selection?: SelectionItem;
};

const CONFIG_KEY = "config";

const onLoadedConfig = (
  config: Config,
  layerMap: LayerMap,
  dispatch: AppDispatch
) => {
  dispatch(setLayers(config.layers));
  const selectedMapLayerId = config.backgroundLayer.selectedLayerId;
  const selectedBackgroundLayer: BackgroundLayer = {
    title: layerMap[selectedMapLayerId].title,
    id: selectedMapLayerId,
    opacity: config.backgroundLayer.opacity,
    description: layerMap[selectedMapLayerId].description,
    inhalt: layerMap[selectedMapLayerId].inhalt,
    eignung: layerMap[selectedMapLayerId].eignung,
    visible: config.backgroundLayer.visible,
    layerType: "wmts",
    props: {
      name: "",
      url: layerMap[selectedMapLayerId].url,
    },
    layers: layerMap[selectedMapLayerId].layers,
  };
  dispatch(
    setBackgroundLayer({
      ...selectedBackgroundLayer,
      id: config.backgroundLayer.id,
    })
  );
  if (config.backgroundLayer.id === "luftbild") {
    dispatch(setSelectedLuftbildLayer(selectedBackgroundLayer));
  } else {
    dispatch(setSelectedMapLayer(selectedBackgroundLayer));
  }
  if (config.selection) {
    dispatch(setConfigSelection(config.selection));
  }
};

export const useAppConfig = (configBaseUrl: string, layerMap: LayerMap) => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  useEffect(() => {
    const hashParams = getHashParams();
    const config = hashParams[CONFIG_KEY];
    if (!config) return;
    setIsLoadingConfig(true);
    const controller = new AbortController();

    fetch(configBaseUrl + config, { signal: controller.signal })
      .then((response) => response.json())
      .then((newConfig: Config) => {
        onLoadedConfig(newConfig, layerMap, dispatch);
        setIsLoadingConfig(false);
        deleteHashParamsFromHistoryState(
          [CONFIG_KEY],
          pathname,
          "remove config postinit"
        );
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        setIsLoadingConfig(false);
        console.error("Error loading config:", error);
      });

    return () => {
      controller.abort();
    };
    // run only once on load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isLoadingConfig;
};
