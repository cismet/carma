import { useEffect, useState } from "react";
import { useStoreInterface } from "../contexts/StoreInterfaceProvider";
import { useHashState } from "../contexts/HashStateProvider";

const defaultOnLoadedConfig = (
  config: Record<string, unknown>,
  layerMap: Record<string, unknown>,
  actions: Record<string, (...args: unknown[]) => unknown>
) => {
  const {
    setLayers,
    setBackgroundLayer,
    setSelectedLuftbildLayer,
    setSelectedMapLayer,
    setConfigSelection,
  } = actions;

  if (setLayers && config.layers) {
    setLayers(config.layers);
  }

  const backgroundLayer = config.backgroundLayer as Record<string, unknown>;
  const selectedMapLayerId = backgroundLayer?.selectedLayerId as string;

  if (!selectedMapLayerId || !layerMap[selectedMapLayerId]) {
    console.warn("Invalid background layer configuration");
    return;
  }

  const layerData = layerMap[selectedMapLayerId] as Record<string, unknown>;
  const selectedBackgroundLayer = {
    title: layerData.title,
    id: selectedMapLayerId,
    opacity: backgroundLayer.opacity,
    description: layerData.description,
    inhalt: layerData.inhalt,
    eignung: layerData.eignung,
    visible: backgroundLayer.visible,
    layerType: "wmts" as const,
    props: {
      name: "",
      url: layerData.url,
    },
    layers: layerData.layers,
  };

  if (setBackgroundLayer) {
    setBackgroundLayer({
      ...selectedBackgroundLayer,
      id: backgroundLayer.id,
    });
  }

  if (backgroundLayer.id === "luftbild" && setSelectedLuftbildLayer) {
    setSelectedLuftbildLayer(selectedBackgroundLayer);
  } else if (setSelectedMapLayer) {
    setSelectedMapLayer(selectedBackgroundLayer);
  }

  if (config.selection && setConfigSelection) {
    setConfigSelection(config.selection);
  }
};

export const useAppConfigSetup = (
  configBaseUrl: string,
  layerMap: Record<string, unknown>,
  configKey: string,
  onLoadedConfig?: (
    config: Record<string, unknown>,
    layerMap: Record<string, unknown>,
    actions: Record<string, (...args: unknown[]) => unknown>
  ) => void
): boolean => {
  const { actions } = useStoreInterface();
  const { updateHash, getHashValues } = useHashState();
  const { mapping } = actions;
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const configLoader = onLoadedConfig || defaultOnLoadedConfig;

  useEffect(() => {
    const hashParams = getHashValues();
    const config = hashParams[configKey];
    if (!config) return;

    // remove hash optimistically
    updateHash({ [configKey]: undefined });

    setIsLoadingConfig(true);
    const controller = new AbortController();

    fetch(configBaseUrl + config, { signal: controller.signal })
      .then((response) => response.json())
      .then((newConfig: Record<string, unknown>) => {
        configLoader(newConfig, layerMap, mapping);
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
