import { useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation } from "react-router-dom";

import {
  type SelectedObject,
  useAdhocFeatureDisplay,
  type LayerMap,
  type SelectionItem,
  type Settings,
} from "@carma-appframeworks/portals";
import type { BackgroundLayer, Layer } from "@carma-mapping/layers";
import { updateHashHistoryState, getHashParams } from "@carma-commons/utils";

import { findFachzwillingByPathname } from "../constants/fachzwillinge";

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
  gazetteerSelection?: SelectionItem;
  selectedFeature?: SelectedObject;
};

const DEFAULT_CONFIG_KEY = "config";

const onLoadedConfig = (
  config: Config,
  layerMap: LayerMap,
  dispatch: AppDispatch,
  setSelectedFeatureById: (
    id: string,
    collectionId: string,
    layerId: string
  ) => void
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
  if (config.gazetteerSelection) {
    dispatch(setConfigSelection(config.gazetteerSelection));
  }
  if (config.selectedFeature) {
    if (
      config.selectedFeature.id &&
      config.selectedFeature.properties.collectionId &&
      config.selectedFeature.properties.layerId
    ) {
      // 3d selection
      setSelectedFeatureById(
        config.selectedFeature.id,
        config.selectedFeature.properties.collectionId,
        config.selectedFeature.properties.layerId
      );
    }
  }
};

export const useAppConfig = (
  configBaseUrl: string,
  layerMap: LayerMap,
  configKey = DEFAULT_CONFIG_KEY
) => {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const { setSelectedFeatureById } = useAdhocFeatureDisplay();
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean | null>(null); // initially null to indicate undetermined state
  const [configId, setConfigId] = useState<string | undefined>(
    () => getHashParams()[configKey]
  );
  /** the config whose layers are currently applied, so a rewritten hash that
   * leaves the key untouched does not re-fetch and re-dispatch it */
  const appliedConfigRef = useRef<string | undefined>(undefined);
  const initialLoadDoneRef = useRef(false);

  // Editing ?config= in the address bar must take effect without a reload.
  // The app's own hash writes go through pushState or location.replace, so they
  // land here too; the applied-config check below makes those a no-op.
  useEffect(() => {
    const readConfigFromHash = () => {
      const next = getHashParams()[configKey];
      setConfigId((current) => (current === next ? current : next));
    };
    window.addEventListener("hashchange", readConfigFromHash);
    window.addEventListener("popstate", readConfigFromHash);
    return () => {
      window.removeEventListener("hashchange", readConfigFromHash);
      window.removeEventListener("popstate", readConfigFromHash);
    };
  }, [configKey]);

  useEffect(() => {
    const config = configId;
    if (config !== undefined && config === appliedConfigRef.current) {
      setIsLoadingConfig(false);
      return;
    }
    if (config === undefined) {
      setIsLoadingConfig(false);
      console.info("[CONFIG] No config key provided in hash parameters.");
      return;
    }
    // Dropping the parameter is itself a hash write, so routes that own their
    // url keep it. They need it: without it a reload falls back to whatever
    // redux-persist happens to hold instead of the configured layers.
    if (!findFachzwillingByPathname(pathname)?.disableHashWrite) {
      // TODO use HashStateProvider Here since its toplevel now
      // can't use HashStateProvider here
      // because it's not yet available
      // and needs to be configured by the config itself
      // use direct history state update instead
      updateHashHistoryState({ [configKey]: undefined }, pathname, {
        label: "remove config search parameter",
        replace: true,
      });
    }

    if (config === null || config === "") {
      setIsLoadingConfig(false);
      console.info("[CONFIG] Empty config key provided in hash parameters.");

      return;
    }

    console.info("[CONFIG] config  provided in hash parameters.", { config });

    // Only the first load blanks the app (isLoadingConfig stays null until it
    // resolves). A later switch keeps the map mounted and just swaps the
    // layers, so the outlet's fitted view survives it.
    if (!initialLoadDoneRef.current) {
      setIsLoadingConfig(true);
    }
    const controller = new AbortController();

    fetch(configBaseUrl + config, { signal: controller.signal })
      .then((response) => response.json())
      .then((newConfig: Config) => {
        onLoadedConfig(newConfig, layerMap, dispatch, setSelectedFeatureById);
        appliedConfigRef.current = config;
        initialLoadDoneRef.current = true;
        setIsLoadingConfig(false);
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        initialLoadDoneRef.current = true;
        setIsLoadingConfig(false);
        console.error("Error loading config:", error);
      });

    return () => {
      controller.abort();
    };
    // re-runs whenever the config key in the hash changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configId]);
  return isLoadingConfig;
};
