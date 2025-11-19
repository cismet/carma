import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";
import { addReplaceLayers, getCustomLayerConfig } from "../slices/mapLayers";
import type { SavedLayerConfig } from "@carma/types";

interface UseAdditionalConfigProps {
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
  addItemToCategory: (
    categoryId: string,
    subCategory: { id: string; Title: string },
    item: SavedLayerConfig | SavedLayerConfig[]
  ) => void;
  setSidebarElements: React.Dispatch<
    React.SetStateAction<
      {
        icon: any;
        text: string;
        id: string;
        disabled?: boolean;
      }[]
    >
  >;
}

const additionalConfigUrl =
  "https://wupp-digitaltwin-assets.cismet.de/data/additionalLayerConfig.json";
const sensorUrl =
  "https://wupp-digitaltwin-assets.cismet.de/data/additionalSensorConfig.json";

export const useAdditionalConfig = ({
  setFeatureFlags,
  addItemToCategory,
  setSidebarElements,
}: UseAdditionalConfigProps) => {
  const [additionalConfig, setAdditionalConfig] = useState<any[]>([]);
  const [sensorConfig, setSensorConfig] = useState<any[]>([]);
  const [loadingAdditionalConfig, setLoadingAdditionalConfig] = useState(true);
  const [loadingSensorConfig, setLoadingSensorConfig] = useState(true);
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const customLayerConfig = useSelector(getCustomLayerConfig);

  const fetchAdditionalConfig = () => {
    fetch(additionalConfigUrl)
      .then((response) => response.json())
      .then((data) => {
        data.forEach((config) => {
          config.layers.forEach((layer) => {
            if (layer.ff as string) {
              setFeatureFlags?.({
                [layer.ff]: {
                  default: false,
                  alias: layer.ff,
                },
              });
            }
          });
        });
        setAdditionalConfig(data);
      })
      .catch((error) => {
        setLoadingAdditionalConfig(false);
        console.error("Error fetching additional config:", error);
      });
  };

  const fetchSensorConfig = () => {
    fetch(sensorUrl)
      .then((response) => response.json())
      .then((data) => {
        data.forEach((config) => {
          config.layers.forEach((layer) => {
            if (layer.ff as string) {
              setFeatureFlags?.({
                [layer.ff]: {
                  default: false,
                  alias: layer.ff,
                },
              });
            }
          });
        });
        setSensorConfig(data);
      })
      .catch((error) => {
        setLoadingSensorConfig(false);
        console.error("Error fetching sensor config:", error);
      });
  };

  useEffect(() => {
    fetchAdditionalConfig();
    fetchSensorConfig();
  }, []);

  useEffect(() => {
    if (customLayerConfig) {
      setAdditionalConfig(customLayerConfig);
    }
  }, [customLayerConfig]);

  // Process additional config for map layers
  useEffect(() => {
    if (additionalConfig.length > 0) {
      additionalConfig.forEach((config, i) => {
        let layers = config.layers
          .filter((layer) => {
            if (layer.ff) {
              const ff = layer.ff as string;
              return flags[ff];
            }
            return true;
          })
          .map((layer) => {
            return {
              ...layer,
              serviceName: config.serviceName || layer.serviceName,
            };
          });

        if (layers.length === 0) {
          return;
        }

        if (config.Title) {
          addItemToCategory(
            "mapLayers",
            { id: config.serviceName, Title: config.Title },
            layers
          );
        } else {
          layers.forEach((layer) => {
            if (layer.replaceId || layer.mergeId) {
              dispatch(addReplaceLayers(layer));
            } else {
              addItemToCategory(
                "mapLayers",
                { id: layer.serviceName, Title: layer.path },
                layer
              );
            }
          });
        }

        if (i === additionalConfig.length - 1) {
          setLoadingAdditionalConfig(false);
        }
      });
    } else {
      setLoadingAdditionalConfig(false);
    }
  }, [additionalConfig, flags]);

  // Process sensor config for sensors
  useEffect(() => {
    if (sensorConfig.length > 0) {
      const hasSensors = sensorConfig.some((config) => {
        if (!config.layers || config.layers.length === 0) {
          return false;
        }
        // Check if any layers pass the feature flag filter
        const availableLayers = config.layers.filter((layer) => {
          if (layer.ff) {
            const ff = layer.ff as string;
            return flags[ff];
          }
          return true;
        });
        return availableLayers.length > 0;
      });

      // Update sidebar elements to enable/disable sensors based on data
      setSidebarElements((prev) =>
        prev.map((element) =>
          element.id === "sensors"
            ? { ...element, disabled: !hasSensors }
            : element
        )
      );

      sensorConfig.forEach((config, i) => {
        let layers = config.layers
          .filter((layer) => {
            if (layer.ff) {
              const ff = layer.ff as string;
              return flags[ff];
            }
            return true;
          })
          .map((layer) => {
            return {
              ...layer,
              serviceName: config.serviceName || layer.serviceName,
            };
          });

        if (layers.length === 0) {
          return;
        }

        if (config.Title) {
          addItemToCategory(
            "sensors",
            { id: config.serviceName, Title: config.Title },
            layers
          );
        }

        if (i === sensorConfig.length - 1) {
          setLoadingSensorConfig(false);
        }
      });
    } else {
      setSidebarElements((prev) =>
        prev.map((element) =>
          element.id === "sensors" ? { ...element, disabled: true } : element
        )
      );
      setLoadingSensorConfig(false);
    }
  }, [sensorConfig, flags]);

  return {
    additionalConfig,
    sensorConfig,
    loadingAdditionalConfig: loadingAdditionalConfig || loadingSensorConfig,
  };
};
