import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagConfig } from "@carma-providers/feature-flag";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { addReplaceLayers } from "../slices/mapLayers";
import type { Config } from "../lib/contracts/carma-layers.d";
import {
  extractReplaceLayers,
  mergeAdditionalConfigs,
} from "../helper/buildCatalog";
import type { CatalogConfigEntry } from "../helper/buildCatalog";

const EMPTY_CONFIG: Config[] = [];

const fetchConfigJson = async (url: string): Promise<Config[]> => {
  const response = await fetch(url);
  return response.json();
};

interface UseAdditionalConfigProps {
  setFeatureFlags?: (flags: FeatureFlagConfig) => void;
  assetBaseUrl: string;
  /** dropped layer configs, applied as overlay over the fetched config */
  droppedLayerConfigs?: CatalogConfigEntry[];
}

export const useAdditionalConfig = ({
  setFeatureFlags,
  assetBaseUrl,
  droppedLayerConfigs,
}: UseAdditionalConfigProps) => {
  const dataBaseUrl = `${assetBaseUrl}/data`;
  const additionalConfigUrl = `${dataBaseUrl}/additionalLayerConfig.json`;
  const sensorUrl = `${dataBaseUrl}/additionalSensorConfig.json`;
  const objectUrl = `${dataBaseUrl}/additionalObjectConfig.json`;
  const [loadingAdditionalConfig, setLoadingAdditionalConfig] = useState(true);
  const dispatch = useDispatch();
  const flags = useFeatureFlags();

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

  const additionalConfig = useMemo(
    () =>
      mergeAdditionalConfigs(
        additionalConfigQuery.data ?? EMPTY_CONFIG,
        droppedLayerConfigs ?? []
      ),
    [additionalConfigQuery.data, droppedLayerConfigs]
  );
  const sensorConfig = sensorConfigQuery.data ?? EMPTY_CONFIG;
  const objectConfig = objectConfigQuery.data ?? EMPTY_CONFIG;

  // register feature flags found in any of the configs
  useEffect(() => {
    [additionalConfig, sensorConfigQuery.data, objectConfigQuery.data].forEach(
      (data) => {
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
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [additionalConfig, sensorConfigQuery.data, objectConfigQuery.data]);

  useEffect(() => {
    if (sensorConfigQuery.isError) {
      console.error("Error fetching sensor config:", sensorConfigQuery.error);
    }
  }, [sensorConfigQuery.isError, sensorConfigQuery.error]);
  useEffect(() => {
    if (objectConfigQuery.isError) {
      console.error("Error fetching object config:", objectConfigQuery.error);
    }
  }, [objectConfigQuery.isError, objectConfigQuery.error]);

  // Dispatch the replace/merge layers derived from the effective config, then
  // release the loading gate so the capabilities queries (which consume the
  // replace layers) may start. A failed fetch must not keep the gate closed.
  useEffect(() => {
    if (additionalConfigQuery.isError) {
      console.error(
        "Error fetching additional config:",
        additionalConfigQuery.error
      );
    }
    extractReplaceLayers(additionalConfig, flags).forEach((layer) => {
      dispatch(addReplaceLayers(layer));
    });
    if (additionalConfigQuery.isSuccess || additionalConfigQuery.isError) {
      setLoadingAdditionalConfig(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    additionalConfig,
    additionalConfigQuery.isSuccess,
    additionalConfigQuery.isError,
    flags,
  ]);

  return {
    additionalConfig,
    sensorConfig,
    objectConfig,
    loadingAdditionalConfig:
      loadingAdditionalConfig ||
      sensorConfigQuery.isPending ||
      objectConfigQuery.isPending,
  };
};
