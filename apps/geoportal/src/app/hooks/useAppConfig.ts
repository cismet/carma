import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  type LayerMap,
  type SelectionItem,
  type Settings,
} from "@carma-apps/portals";
import type { BackgroundLayer, Layer } from "@carma-commons/types";
import { updateHashHistoryState, getHashParams } from "@carma-commons/utils";

import {
  setBackgroundLayer,
  setConfigSelection,
  setLayers,
  setSelectedLuftbildLayer,
  setSelectedMapLayer,
} from "../store/slices/mapping";

import { AppDispatch } from "../store";

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

const DEFAULT_CONFIG_KEY = "config";

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

export const useAppConfig = (
  configBaseUrl: string,
  layerMap: LayerMap,
  configKey = DEFAULT_CONFIG_KEY
) => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean | null>(null); // initially null to indicate undetermined state

  useEffect(() => {
    const hashParams = getHashParams();
    const config = hashParams[configKey];
    if (config === undefined) {
      setIsLoadingConfig(false);
      console.info("[CONFIG] No config key provided in hash parameters.");
      return;
    }
    updateHashHistoryState({ [configKey]: undefined }, pathname, {
      label: "remove config search parameter",
    });

    if (config === null || config === "") {
      setIsLoadingConfig(false);
      console.info("[CONFIG] Empty config key provided in hash parameters.");

      return;
    }

    console.info("[CONFIG] config  provided in hash parameters.");
    // already removed from hash, so we can safely ignore it

    setIsLoadingConfig(true);
    const controller = new AbortController();

    fetch(configBaseUrl + config, { signal: controller.signal })
      .then((response) => response.json())
      .then((newConfig: Config) => {
        onLoadedConfig(newConfig, layerMap, dispatch);
        setIsLoadingConfig(false);
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
