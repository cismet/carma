import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import {
  useFeatureFlags,
  type FeatureFlagConfig,
} from "@carma-providers/feature-flag";
import { addReplaceLayers, getCustomLayerConfig } from "../slices/mapLayers";
import type { Config, SavedLayerConfig } from "../lib/contracts/carma-layers.d";
import { processCategoryConfig } from "../helper/processCategoryConfig";

const EMPTY_CONFIG: Config[] = [];

const fetchConfigJson = async (url: string): Promise<Config[]> => {
  const response = await fetch(url);
  return response.json();
};

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
  assetBaseUrl: string;
}

export const useAdditionalConfig = ({
  setFeatureFlags,
  addItemToCategory,
  setSidebarElements,
  assetBaseUrl,
}: UseAdditionalConfigProps) => {
  const dataBaseUrl = `${assetBaseUrl}/data`;
  const additionalConfigUrl = `${dataBaseUrl}/additionalLayerConfig.json`;
  const sensorUrl = `${dataBaseUrl}/additionalSensorConfig.json`;
  const objectUrl = `${dataBaseUrl}/additionalObjectConfig.json`;
  const [loadingAdditionalConfig, setLoadingAdditionalConfig] = useState(true);
  const [loadingSensorConfig, setLoadingSensorConfig] = useState(true);
  const [loadingObjectConfig, setLoadingObjectConfig] = useState(true);
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

  const customLayerConfig = useSelector(getCustomLayerConfig);

  const additionalConfigQuery = useQuery({
    queryKey: ["additionalConfig", additionalConfigUrl],
    queryFn: () => fetchConfigJson(additionalConfigUrl),
  });
  const sensorConfigQuery = useQuery({
    queryKey: ["sensorConfig", sensorUrl],
    queryFn: () => fetchConfigJson(sensorUrl),
  });
  const objectConfigQuery = useQuery({
    queryKey: ["objectConfig", objectUrl],
    queryFn: () => fetchConfigJson(objectUrl),
  });

  const additionalConfig = customLayerConfig?.length
    ? customLayerConfig
    : additionalConfigQuery.data ?? EMPTY_CONFIG;
  const sensorConfig = sensorConfigQuery.data ?? EMPTY_CONFIG;
  const objectConfig = objectConfigQuery.data ?? EMPTY_CONFIG;

  // register feature flags found in any of the configs
  useEffect(() => {
    [
      additionalConfigQuery.data,
      sensorConfigQuery.data,
      objectConfigQuery.data,
    ].forEach((data) => {
      data?.forEach((config) => {
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    additionalConfigQuery.data,
    sensorConfigQuery.data,
    objectConfigQuery.data,
  ]);

  // a failed config fetch must not keep the catalog in the loading state
  useEffect(() => {
    if (additionalConfigQuery.isError) {
      console.error(
        "Error fetching additional config:",
        additionalConfigQuery.error
      );
      setLoadingAdditionalConfig(false);
    }
  }, [additionalConfigQuery.isError, additionalConfigQuery.error]);
  useEffect(() => {
    if (sensorConfigQuery.isError) {
      console.error("Error fetching sensor config:", sensorConfigQuery.error);
      setLoadingSensorConfig(false);
    }
  }, [sensorConfigQuery.isError, sensorConfigQuery.error]);
  useEffect(() => {
    if (objectConfigQuery.isError) {
      console.error("Error fetching object config:", objectConfigQuery.error);
      setLoadingObjectConfig(false);
    }
  }, [objectConfigQuery.isError, objectConfigQuery.error]);

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
    } else if (additionalConfigQuery.isSuccess) {
      setLoadingAdditionalConfig(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalConfig, additionalConfigQuery.isSuccess, flags]);

  useEffect(() => {
    processCategoryConfig({
      config: sensorConfig,
      categoryId: "sensors",
      flags,
      addItemToCategory,
      setSidebarElements,
      setLoading: setLoadingSensorConfig,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectConfig, flags]);

  return {
    additionalConfig,
    sensorConfig,
    objectConfig,
    loadingAdditionalConfig:
      loadingAdditionalConfig || loadingSensorConfig || loadingObjectConfig,
  };
};
