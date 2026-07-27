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
import type { ActiveLayers } from "../lib/contracts/carma-layers.d";
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
      debugStates: wmsServices.map((service, index) => ({
        name: service.name,
        status: results[index].status,
        isFetching: results[index].isFetching,
        hasData: results[index].data != null,
      })),
    }),
  });

  useEffect(() => {
    console.debug(
      "[CAP CACHE] live query states",
      JSON.stringify(capabilities.debugStates)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(capabilities.debugStates)]);

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

  // the active layers are only read when a rebuild runs; going through a ref
  // avoids re-deriving the whole structure on every active layer change
  const activeLayersRef = useRef(activeLayers);
  activeLayersRef.current = activeLayers;

  const syncedCapabilitiesRef = useRef<unknown[]>([]);
  const syncedReplaceLayersRef = useRef<unknown>(undefined);

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

              // carry over app-owned annotations that capabilities cannot
              // produce (e.g. layer-group membership); otherwise the re-parsed
              // layer never matches and this sync dispatches updateLayer forever
              const mergedLayer: Layer = {
                ...updatedLayer,
                ...(activeLayer.group ? { group: activeLayer.group } : {}),
                ...(activeLayer.skipSelection
                  ? { skipSelection: activeLayer.skipSelection }
                  : {}),
              };

              if (
                !isEqual(
                  normalizeObject(activeLayer),
                  normalizeObject(mergedLayer)
                ) &&
                updateActiveLayer
              ) {
                updateActiveLayer(mergedLayer);
              }
            }
          });
        }
      });
    };

    let newLayers: any[] = [];

    const replaceLayersChanged =
      syncedReplaceLayersRef.current !== replaceLayers;
    syncedReplaceLayersRef.current = replaceLayers;

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
      if (
        replaceLayersChanged ||
        syncedCapabilitiesRef.current[index] !== wms
      ) {
        syncedCapabilitiesRef.current[index] = wms;
        syncActiveLayers(layerStructure);
      }
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
