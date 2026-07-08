/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef } from "react";
import { isEqual } from "lodash";
import { useQueries } from "@tanstack/react-query";
import WMSCapabilities from "wms-capabilities";
import type { WMSCapabilitiesJSON } from "wms-capabilities";
import type { Layer, LayerConfig } from "../lib/contracts/carma-layers.d";

import { useCatalogData } from "../context/LayerCatalogProvider";
import { baseConfig as config } from "../helper/config";
import {
  getLayerStructure,
  mergeStructures,
  normalizeObject,
} from "../helper/layerHelper";
import type { ActiveLayers } from "../components/LayerCatalog";
import { parseToMapLayer } from "@carma-mapping/utils";
import { FALLBACK_CAPABILITIES_BASE_URL } from "../helper/assetUrls";
import {
  CAPABILITIES_MAX_AGE,
  CAPABILITIES_QUERY_KEY,
} from "../config/CatalogQueryProvider";

// @ts-expect-error
const parser = new WMSCapabilities();

const CAPABILITIES_STALE_TIME = 0;
const CAPABILITIES_GC_TIME = CAPABILITIES_MAX_AGE;

const fetchCapabilitiesText = async (url: string, fallbackUrl: string) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `GetCapabilities request failed with status ${response.status}`
      );
    }
    return await response.text();
  } catch (error) {
    console.warn(
      `[CAPABILITIES] remote fetch failed for ${url}, trying local fallback ${fallbackUrl}`,
      error
    );
    const fallbackResponse = await fetch(fallbackUrl);
    if (!fallbackResponse.ok) {
      throw error;
    }
    return await fallbackResponse.text();
  }
};

const fetchCapabilities = async (
  url: string
): Promise<WMSCapabilitiesJSON | null> => {
  const serviceSegment = url.split("/").pop();
  const text = await fetchCapabilitiesText(
    `${url}?service=WMS&request=GetCapabilities&version=1.1.1`,
    `${FALLBACK_CAPABILITIES_BASE_URL}/${serviceSegment}.xml`
  );
  const result = parser.toJSON(text);
  // unparseable responses come back as { version: null } without Capability
  return result?.Capability ? result : null;
};

interface UseLoadCapabilitiesProps {
  loadingAdditionalConfig: boolean;
  activeLayers: ActiveLayers;
  updateActiveLayer?: (layer: Layer) => void;
  services: Record<string, LayerConfig>;
}

export const useLoadCapabilities = ({
  loadingAdditionalConfig,
  activeLayers,
  updateActiveLayer,
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
      gcTime: CAPABILITIES_GC_TIME,
    })),
    combine: (results) => ({
      data: results.map((result) => result.data),
      initialLoadingNames: wmsServices
        .filter((_, index) => results[index].isFetching && !results[index].data)
        .map((service) => service.name),
      anySettled: results.some((result) => result.isSuccess || result.isError),
    }),
  });

  // feed the loading flags consumed by LayerTabs / ItemGrid
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

  // the active layers are only read when a rebuild runs; going through a ref
  // avoids re-deriving the whole structure on every active layer change
  const activeLayersRef = useRef(activeLayers);
  activeLayersRef.current = activeLayers;

  // Derive allLayers from all capabilities present so far. Runs again when
  // late replace layers arrive, so the result no longer depends on response
  // order.
  useEffect(() => {
    if (loadingAdditionalConfig) {
      return;
    }

    const syncActiveLayers = (
      layerStructure: { Title: string; layers: any[] }[]
    ) => {
      layerStructure.forEach((category) => {
        if (category.layers.length > 0) {
          activeLayersRef.current.forEach(async (activeLayer) => {
            const foundLayer = category.layers.find(
              (layer) => layer.id === activeLayer.id
            );
            if (foundLayer) {
              if (activeLayer.dynamicStyling) {
                return;
              }

              const updatedLayer = await parseToMapLayer(
                foundLayer,
                false,
                activeLayer.visible,
                activeLayer.opacity
              );

              if (
                !isEqual(
                  normalizeObject(activeLayer),
                  normalizeObject(updatedLayer)
                ) &&
                updateActiveLayer
              ) {
                updateActiveLayer(updatedLayer);
              }
            }
          });
        }
      });
    };

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
      syncActiveLayers(layerStructure);
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
