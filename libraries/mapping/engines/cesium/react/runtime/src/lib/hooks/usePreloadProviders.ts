import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";

import type { CesiumTerrainProvider, ImageryLayer } from "@carma-cesium";

import {
  loadCesiumTerrainProvider,
  loadCesiumImageryLayer,
  normalizeImageryLayerConfigs,
  normalizeTerrainProviderConfigs,
} from "../utils/cesiumProviders";
import type { ProviderConfig } from "../utils/cesiumProviders";
interface ProviderRefs {
  terrainProviderRefsByIdRef: MutableRefObject<
    Record<string, CesiumTerrainProvider | null | undefined>
  >;
  imageryLayerRefsByIdRef: MutableRefObject<
    Record<string, ImageryLayer | null | undefined>
  >;
}

/**
 * Pre-loads all Cesium providers before runtime initialization.
 * Returns true when all providers are ready.
 */
export const usePreloadProviders = (
  refs: ProviderRefs,
  config: ProviderConfig
): boolean => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;

    const loadAll = async () => {
      console.info("[CESIUM|PRELOAD] Starting provider preload");
      const startTime = performance.now();

      try {
        const promises: Promise<void>[] = [];
        const terrainProviderConfigs = normalizeTerrainProviderConfigs(config);
        const imageryLayerConfigs = normalizeImageryLayerConfigs(config);

        for (const [id, terrainProviderConfig] of Object.entries(
          terrainProviderConfigs
        )) {
          promises.push(
            loadCesiumTerrainProvider(terrainProviderConfig.url, signal).then(
              (provider) => {
                if (!signal.aborted) {
                  refs.terrainProviderRefsByIdRef.current[id] = provider;
                }
                console.debug("[CESIUM|PRELOAD] Terrain provider ready", id);
              }
            )
          );
        }

        for (const [id, imageryLayerConfig] of Object.entries(
          imageryLayerConfigs
        )) {
          promises.push(
            loadCesiumImageryLayer(imageryLayerConfig, signal).then((layer) => {
              if (!signal.aborted) {
                refs.imageryLayerRefsByIdRef.current[id] = layer;
              }
              console.debug("[CESIUM|PRELOAD] Imagery layer ready", id);
            })
          );
        }

        await Promise.all(promises);

        if (!signal.aborted) {
          const duration = performance.now() - startTime;
          console.info(
            `[CESIUM|PRELOAD] All providers ready after ${duration.toFixed(
              0
            )}ms`
          );
          setIsReady(true);
        }
      } catch (error) {
        if (!signal.aborted) {
          console.error("[CESIUM|PRELOAD] Failed to load providers:", error);
          // Still set ready to allow runtime to initialize with whatever loaded
          setIsReady(true);
        }
      }
    };

    loadAll();

    return () => {
      abortController.abort();
    };
    // Refs are stable (React guarantee), config object is passed from parent
  }, [refs, config]);

  return isReady;
};
