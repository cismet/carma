import { useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import type { CesiumTerrainProvider, ImageryLayer } from "@carma/cesium";
import type { ProviderConfig } from "../utils/cesiumProviders";
import {
  loadCesiumTerrainProvider,
  loadCesiumImageryLayer,
} from "../utils/cesiumProviders";

interface ProviderRefs {
  terrainProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  surfaceProviderRef: MutableRefObject<CesiumTerrainProvider | null>;
  imageryLayerRef: MutableRefObject<ImageryLayer | null>;
}

/**
 * Pre-loads all Cesium providers before viewer initialization.
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

        // Load terrain provider
        promises.push(
          loadCesiumTerrainProvider(
            refs.terrainProviderRef,
            config.terrainProvider.url,
            signal
          ).then(() => {
            console.debug("[CESIUM|PRELOAD] Terrain provider ready");
          })
        );

        // Load surface provider if configured
        if (config.surfaceProvider) {
          promises.push(
            loadCesiumTerrainProvider(
              refs.surfaceProviderRef,
              config.surfaceProvider.url,
              signal
            ).then(() => {
              console.debug("[CESIUM|PRELOAD] Surface provider ready");
            })
          );
        }

        // Load imagery layer if configured
        if (config.imageryProvider) {
          promises.push(
            loadCesiumImageryLayer(
              refs.imageryLayerRef,
              config.imageryProvider,
              signal
            ).then(() => {
              console.debug("[CESIUM|PRELOAD] Imagery layer ready");
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
          // Still set ready to allow viewer to initialize with whatever loaded
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
