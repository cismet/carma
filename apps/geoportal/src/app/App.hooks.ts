import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import LZString from "lz-string";
import { URLSearchParams } from "url";

import type { BackgroundLayer, LayerMap, Settings } from "@carma-apps/portals";
import type { Layer } from "@carma-mapping/layers";

import { AppDispatch } from "./store";
import {
  getBackgroundLayer,
  getSelectedMapLayer,
  setBackgroundLayer,
  setLayers,
  setSelectedMapLayer,
  setShowFullscreenButton,
  setShowHamburgerMenu,
  setShowLocatorButton,
  setShowMeasurementButton,
} from "./store/slices/mapping";
import {
  setUIAllowChanges,
  setUIShowLayerButtons,
  setUIShowLayerHideButtons,
} from "./store/slices/ui";

type Config = {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  settings?: Settings;
};

export function useRouteLogging() {
  const location = useLocation();
  useEffect(() => {
    console.debug(
      " [GEOPORTAL|ROUTER] App Route changed to:",
      location.pathname
    );
  }, [location]);
}

export function useSyncAndConfig({
  searchParams,
  setSearchParams,
  published = false,
}: {
  searchParams: URLSearchParams;
  setSearchParams: (searchParams: URLSearchParams) => void;
  published?: boolean;
}): { syncToken: string | null; loadingConfig: boolean } {
  const dispatch: AppDispatch = useDispatch();
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState<boolean>(false);

  const configBaseUrl = "https://gist.githubusercontent.com/d4v3000/";

  useEffect(() => {
    if (searchParams.get("sync")) {
      setSyncToken(searchParams.get("sync"));
    }

    if (searchParams.get("config")) {
      setLoadingConfig(true);
      const config = searchParams.get("config");

      fetch(configBaseUrl + config)
        .then((response) => response.json())
        .then((newConfig: Config) => {
          dispatch(setLayers(newConfig.layers));
          dispatch(setBackgroundLayer(newConfig.backgroundLayer));
          searchParams.delete("config");
          setSearchParams(searchParams);
        })
        .finally(() => setLoadingConfig(false));
    }

    if (searchParams.get("data")) {
      const data = searchParams.get("data");
      const newConfig: Config = JSON.parse(
        LZString.decompressFromEncodedURIComponent(data)
      );
      dispatch(setLayers(newConfig.layers));
      dispatch(setBackgroundLayer(newConfig.backgroundLayer));
      if (newConfig.settings) {
        dispatch(setUIShowLayerButtons(newConfig.settings.showLayerButtons));
        dispatch(setShowFullscreenButton(newConfig.settings.showFullscreen));
        dispatch(setShowLocatorButton(newConfig.settings.showLocator));
        dispatch(setShowMeasurementButton(newConfig.settings.showMeasurement));
        dispatch(setShowHamburgerMenu(newConfig.settings.showHamburgerMenu));

        if (newConfig.settings.showLayerHideButtons || published) {
          dispatch(setUIAllowChanges(false));
          dispatch(setUIShowLayerHideButtons(true));
        } else {
          dispatch(setUIAllowChanges(true));
          dispatch(setUIShowLayerHideButtons(false));
        }
      }
      searchParams.delete("data");
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams, dispatch, published]);

  return { syncToken, loadingConfig };
}

export function useInitializeMapLayers(layerMap: LayerMap) {
  const dispatch: AppDispatch = useDispatch();
  const backgroundLayer = useSelector(getBackgroundLayer);
  const selectedMapLayer = useSelector(getSelectedMapLayer);

  useEffect(() => {
    const backgroundLayerId = backgroundLayer.id;
    const selectedMapLayerId = selectedMapLayer.id;

    const getId = () => {
      return backgroundLayerId === "luftbild"
        ? backgroundLayerId
        : selectedMapLayerId;
    };

    dispatch(
      setBackgroundLayer({
        title: layerMap[getId()].title,
        id: backgroundLayerId,
        opacity: backgroundLayer.opacity,
        description: layerMap[getId()].description,
        inhalt: layerMap[getId()].inhalt,
        eignung: layerMap[getId()].eignung,
        visible: backgroundLayer.visible,
        layerType: "wmts",
        props: {
          name: "",
          url: layerMap[getId()].url,
        },
        layers: layerMap[getId()].layers,
      })
    );

    dispatch(
      setSelectedMapLayer({
        title: layerMap[selectedMapLayerId].title,
        id: selectedMapLayerId,
        opacity: 1.0,
        description: ``,
        inhalt: layerMap[selectedMapLayerId].inhalt,
        eignung: layerMap[selectedMapLayerId].eignung,
        visible: selectedMapLayer.visible,
        layerType: "wmts",
        props: {
          name: "",
          url: layerMap[selectedMapLayerId].url,
        },
        layers: layerMap[selectedMapLayerId].layers,
      })
    );
  }, []);
}
