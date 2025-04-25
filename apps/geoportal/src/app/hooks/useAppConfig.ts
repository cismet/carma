import { useEffect, useState, useRef } from "react";
import { useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";

import { BackgroundLayer, LayerMap, Settings } from "@carma-apps/portals";
import { Layer } from "@carma-mapping/layers";

import {
  setBackgroundLayer,
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
};

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
};

export const useAppConfig = (configBaseUrl: string, layerMap: LayerMap) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch();
  const config = searchParams.get("config");
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  useEffect(() => {
    if (!config) return;
    setIsLoadingConfig(true);
    const controller = new AbortController();

    fetch(configBaseUrl + config, { signal: controller.signal })
      .then((response) => response.json())
      .then((newConfig: Config) => {
        onLoadedConfig(newConfig, layerMap, dispatch);
        searchParams.delete("config");
        setSearchParams(searchParams);
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
