import { useEffect, useState, useRef } from "react";
import type { Viewer } from "cesium";
import { CesiumTerrainProvider } from "cesium";

import { useCesiumContext } from "@carma-mapping/cesium-engine";
import { prepareSceneForHGK } from "../utils/scene";

const MAX_RETRIES = 5;
const RETRY_DELAY = 100;

const terrainProvidersMap = new WeakMap<
  Viewer,
  Record<string, CesiumTerrainProvider>
>();

const getProvider = async (
  viewer: Viewer,
  hqKey: string,
  HGK_TERRAIN_PROVIDER_URLS: Record<string, string>
) => {
  if (viewer.isDestroyed()) return null;
  if (!terrainProvidersMap.has(viewer)) {
    terrainProvidersMap.set(viewer, {});
  }

  const viewerTerrainProviders = terrainProvidersMap.get(viewer) ?? {};

  if (viewerTerrainProviders[hqKey]) {
    console.debug("Existing HQ Terrain Layer Provider found", hqKey);
    return viewerTerrainProviders[hqKey];
  }

  try {
    const url = HGK_TERRAIN_PROVIDER_URLS[hqKey];
    if (!url) {
      console.warn(`No terrain provider URL found for key: ${hqKey}`);
      return null;
    }

    const provider = await CesiumTerrainProvider.fromUrl(url);
    console.debug("New HQ Terrain Layer Provider Initialized", hqKey);

    viewerTerrainProviders[hqKey] = provider;
    terrainProvidersMap.set(viewer, viewerTerrainProviders);

    return provider;
  } catch (e) {
    console.warn(e);
    return null;
  }
};

export const useHGKCesiumTerrain = (
  selectedSimulation: number,
  isHWS: boolean,
  HGK_KEYS,
  HGK_TERRAIN_PROVIDER_URLS
) => {
  const { terrainProviderRef, viewerRef, isViewerReady } = useCesiumContext();
  const retryTimeoutRef = useRef<number | null>(null);
  const currentAttemptRef = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const useHws = isHWS && selectedSimulation !== 2;
    const hqKey = HGK_KEYS[selectedSimulation][useHws ? "hws" : "noHws"];
    const attemptId = `${hqKey}-${Date.now()}`;
    currentAttemptRef.current = attemptId;

    if (retryTimeoutRef.current !== null) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    setRetryCount(0);

    if (!hqKey) return;

    const loadTerrain = (retry = 0) => {
      if (currentAttemptRef.current !== attemptId) return;

      if (
        !isViewerReady ||
        !viewerRef.current ||
        viewerRef.current.isDestroyed()
      ) {
        console.debug(
          "hq Key changed, viewer not ready yet",
          hqKey,
          selectedSimulation,
          useHws,
          retry
        );

        if (retry < MAX_RETRIES) {
          const nextRetryDelay = RETRY_DELAY * Math.pow(2, retry);

          retryTimeoutRef.current = window.setTimeout(() => {
            if (currentAttemptRef.current === attemptId) {
              setRetryCount(retry + 1);
              loadTerrain(retry + 1);
            }
          }, nextRetryDelay);
        } else {
          console.warn("HQ Max retries reached, not setting terrain provider");
        }
        return;
      }

      console.debug(
        "hq Key changed, viewer ready",
        hqKey,
        selectedSimulation,
        useHws,
        retry
      );

      const viewer = viewerRef.current;
      if (!viewer) return;

      setTimeout(() => {
        !viewer.isDestroyed() && prepareSceneForHGK(viewer);
      }, 500);
      viewer.scene.requestRender();

      getProvider(viewer, hqKey, HGK_TERRAIN_PROVIDER_URLS).then((provider) => {
        if (
          currentAttemptRef.current !== attemptId ||
          !viewer ||
          viewer.isDestroyed()
        )
          return;

        terrainProviderRef.current = provider;
        if (provider && viewer.scene) {
          try {
            viewer.scene.terrainProvider = provider;
            viewer.scene.requestRender();
          } catch (e) {
            console.warn("Error applying terrain provider:", e);
          }
        }
      });
    };

    loadTerrain(retryCount);

    return () => {
      if (retryTimeoutRef.current !== null) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
  }, [
    isHWS,
    selectedSimulation,
    terrainProviderRef,
    viewerRef,
    isViewerReady,
    HGK_KEYS,
    HGK_TERRAIN_PROVIDER_URLS,
    retryCount,
  ]);
};
