import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";
import { addReplaceLayers, getCustomLayerConfig } from "../slices/mapLayers";
import type { Config, SavedLayerConfig } from "@carma/types";
import { processCategoryConfig } from "../helper/processCategoryConfig";

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
const objectUrl =
  "https://wupp-digitaltwin-assets.cismet.de/data/additionalObjectConfig.json";

export const useAdditionalConfig = ({
  setFeatureFlags,
  addItemToCategory,
  setSidebarElements,
}: UseAdditionalConfigProps) => {
  const [additionalConfig, setAdditionalConfig] = useState<Config[]>([]);
  const [sensorConfig, setSensorConfig] = useState<Config[]>([]);
  const [objectConfig, setObjectConfig] = useState<Config[]>([]);
  const [loadingAdditionalConfig, setLoadingAdditionalConfig] = useState(true);
  const [loadingSensorConfig, setLoadingSensorConfig] = useState(true);
  const [loadingObjectConfig, setLoadingObjectConfig] = useState(true);
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const customLayerConfig = useSelector(getCustomLayerConfig);

  const fetchConfig = (
    url: string,
    setConfig: (data: Config[]) => void,
    setLoading: (loading: boolean) => void,
    name: string
  ) => {
    fetch(url)
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
        setConfig(data);
      })
      .catch((error) => {
        setLoading(false);
        console.error(`Error fetching ${name} config:`, error);
      });
  };

  useEffect(() => {
    fetchConfig(
      additionalConfigUrl,
      setAdditionalConfig,
      setLoadingAdditionalConfig,
      "additional"
    );
    fetchConfig(sensorUrl, setSensorConfig, setLoadingSensorConfig, "sensor");
    fetchConfig(objectUrl, setObjectConfig, setLoadingObjectConfig, "object");
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

  useEffect(() => {
    processCategoryConfig({
      config: sensorConfig,
      categoryId: "sensors",
      flags,
      addItemToCategory,
      setSidebarElements,
      setLoading: setLoadingSensorConfig,
    });
  }, [sensorConfig, flags]);

  useEffect(() => {
    processCategoryConfig({
      config: objectConfig,
      categoryId: "objects",
      flags,
      addItemToCategory,
      setSidebarElements,
      setLoading: setLoadingObjectConfig,
    });
  }, [objectConfig, flags]);

  return {
    additionalConfig,
    sensorConfig,
    objectConfig,
    loadingAdditionalConfig:
      loadingAdditionalConfig || loadingSensorConfig || loadingObjectConfig,
  };
};
