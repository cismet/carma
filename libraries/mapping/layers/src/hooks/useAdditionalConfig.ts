import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FeatureFlagConfig } from "@carma-providers/feature-flag";
import { useFeatureFlags } from "@carma-providers/feature-flag";
import { useCatalogData } from "../context/LayerCatalogProvider";
import type { Config } from "../lib/contracts/carma-layers.d";
import {
  extractReplaceLayers,
  mergeAdditionalConfigs,
} from "../helper/buildCatalog";
import type { CatalogConfigEntry } from "../helper/buildCatalog";
import {
  ADDITIONAL_CONFIG_QUERY_KEY,
  OBJECT_CONFIG_QUERY_KEY,
  PERSISTED_QUERY_GC_TIME,
  SENSOR_CONFIG_QUERY_KEY,
} from "../config/CatalogQueryProvider";

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
  const { upsertReplaceLayer } = useCatalogData();
  const flags = useFeatureFlags();

  const additionalConfigQuery = useQuery({
    queryKey: [ADDITIONAL_CONFIG_QUERY_KEY, additionalConfigUrl],
    queryFn: () => fetchConfigJson(additionalConfigUrl),
    gcTime: PERSISTED_QUERY_GC_TIME,
  });
  const sensorConfigQuery = useQuery({
    queryKey: [SENSOR_CONFIG_QUERY_KEY, sensorUrl],
    queryFn: () => fetchConfigJson(sensorUrl),
    gcTime: PERSISTED_QUERY_GC_TIME,
  });
  const objectConfigQuery = useQuery({
    queryKey: [OBJECT_CONFIG_QUERY_KEY, objectUrl],
    queryFn: () => fetchConfigJson(objectUrl),
    gcTime: PERSISTED_QUERY_GC_TIME,
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
      upsertReplaceLayer(layer);
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
    // this gate blocks both the capabilities queries and the category
    // derivation, so all three configs are persisted to keep it short
    loadingAdditionalConfig:
      loadingAdditionalConfig ||
      sensorConfigQuery.isPending ||
      objectConfigQuery.isPending,
  };
};
