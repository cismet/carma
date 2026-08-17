/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import WMSCapabilities from "wms-capabilities";
import type { WMSCapabilitiesJSON } from "wms-capabilities";
import type { LayerConfig } from "../lib/contracts/carma-layers.d";

import { useCatalogData } from "../context/LayerCatalogProvider";
import { baseConfig as config } from "../helper/config";
import { getLayerStructure, mergeStructures } from "../helper/layerHelper";
import { FALLBACK_CAPABILITIES_BASE_URL } from "../helper/assetUrls";
import {
  CAPABILITIES_QUERY_KEY,
  PERSISTED_QUERY_GC_TIME,
} from "../config/CatalogQueryProvider";

// @ts-expect-error
const parser = new WMSCapabilities();

// 0: the restored capabilities render immediately and refresh in the background
const CAPABILITIES_STALE_TIME = 0;

const fetchParsedCapabilities = async (
  url: string
): Promise<WMSCapabilitiesJSON> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `GetCapabilities request failed with status ${response.status}`
    );
  }
  const result = parser.toJSON(await response.text());
  // unparseable responses come back as { version: null } without Capability
  if (!result?.Capability) {
    throw new Error(`GetCapabilities response from ${url} is not parseable`);
  }
  return result;
};

const fetchCapabilities = async (url: string): Promise<WMSCapabilitiesJSON> => {
  const serviceSegment = url.split("/").pop();
  const fallbackUrl = `${FALLBACK_CAPABILITIES_BASE_URL}/${serviceSegment}.xml`;
  try {
    return await fetchParsedCapabilities(
      `${url}?service=WMS&request=GetCapabilities&version=1.1.1`
    );
  } catch (error) {
    console.warn(
      `[CAPABILITIES] remote fetch failed for ${url}, trying local fallback ${fallbackUrl}`,
      error
    );
    try {
      return await fetchParsedCapabilities(fallbackUrl);
    } catch {
      throw error;
    }
  }
};

interface UseLoadCapabilitiesProps {
  loadingAdditionalConfig: boolean;
  services: Record<string, LayerConfig>;
}

export const useLoadCapabilities = ({
  loadingAdditionalConfig,
  services,
}: UseLoadCapabilitiesProps) => {
  const { replaceLayers, setCapabilitiesLoading, setServiceCategories } =
    useCatalogData();

  const wmsServices = useMemo(
    () => Object.values(services).filter((service) => !!service.url),
    [services]
  );
  const localServices = useMemo(
    () =>
      Object.values(services).filter(
        (service) => !service.url && service.type !== "topicmaps"
      ),
    [services]
  );

  const capabilities = useQueries({
    queries: wmsServices.map((service) => ({
      queryKey: [CAPABILITIES_QUERY_KEY, service.name, service.url],
      queryFn: () => fetchCapabilities(service.url as string),
      // the additional config dispatches the replace layers; waiting for it
      // keeps active-layer updates based on the replaced definitions
      enabled: !loadingAdditionalConfig,
      staleTime: CAPABILITIES_STALE_TIME,
      gcTime: PERSISTED_QUERY_GC_TIME,
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      initialLoadingNames: wmsServices
        .filter((_, index) => results[index].isFetching && !results[index].data)
        .map((service) => service.name),
      anySettled: results.some((result) => result.isSuccess || result.isError),
    }),
  });

  // feed the loading flags consumed by CategoryTabs / CatalogGrid
  useEffect(() => {
    setCapabilitiesLoading(
      capabilities.initialLoadingNames,
      wmsServices.length > 0 && !capabilities.anySettled
    );
  }, [
    capabilities.initialLoadingNames,
    capabilities.anySettled,
    wmsServices,
    setCapabilitiesLoading,
  ]);

  // Derive allLayers from all capabilities present so far. Runs again when
  // late replace layers arrive, so the result no longer depends on response
  // order.
  useEffect(() => {
    if (loadingAdditionalConfig) {
      return;
    }

    let newLayers: any[] = [];

    wmsServices.forEach((service, index) => {
      const wms = capabilities.data[index];
      if (!wms) {
        return;
      }
      const layerStructure = getLayerStructure({
        config,
        wms,
        serviceName: service.name,
        skipTopicMaps: true,
        replaceLayers,
      });
      newLayers = mergeStructures(layerStructure, newLayers);
    });

    localServices.forEach((service) => {
      const layerStructure = getLayerStructure({
        config,
        serviceName: service.name,
        skipTopicMaps: true,
        replaceLayers,
      });
      newLayers = mergeStructures(layerStructure, newLayers);
    });

    if (newLayers.length > 0) {
      setServiceCategories(newLayers);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    capabilities.data,
    replaceLayers,
    loadingAdditionalConfig,
    wmsServices,
    localServices,
    setServiceCategories,
  ]);
};
