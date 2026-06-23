import { useEffect, useState, useRef } from "react";

import { CesiumTerrainProvider } from "@carma-cesium";

import {
  type CesiumRuntime,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/react/runtime";

import { prepareSceneForHGK } from "../utils/scene";
const MAX_RETRIES = 5;
const RETRY_DELAY = 100;

const terrainProvidersMap = new WeakMap<
  CesiumRuntime,
  Record<string, CesiumTerrainProvider>
>();

const getProvider = async (
  runtime: CesiumRuntime,
  hqKey: string,
  HGK_TERRAIN_PROVIDER_URLS: Record<string, string>
) => {
  if (runtime.isDestroyed()) return null;
  if (!terrainProvidersMap.has(runtime)) {
    terrainProvidersMap.set(runtime, {});
  }

  const runtimeTerrainProviders = terrainProvidersMap.get(runtime) ?? {};

  if (runtimeTerrainProviders[hqKey]) {
    console.debug("Existing HQ Terrain Layer Provider found", hqKey);
    return runtimeTerrainProviders[hqKey];
  }

  try {
    const url = HGK_TERRAIN_PROVIDER_URLS[hqKey];
    if (!url) {
      console.warn(`No terrain provider URL found for key: ${hqKey}`);
      return null;
    }

    const provider = await CesiumTerrainProvider.fromUrl(url);
    console.debug("New HQ Terrain Layer Provider Initialized", hqKey);

    runtimeTerrainProviders[hqKey] = provider;
    terrainProvidersMap.set(runtime, runtimeTerrainProviders);

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
  const { runtimeRef, isRuntimeReady } = useCesiumContext();
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
        !isRuntimeReady ||
        !runtimeRef.current ||
        runtimeRef.current.isDestroyed()
      ) {
        console.debug(
          "hq Key changed, runtime not ready yet",
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
        "hq Key changed, runtime ready",
        hqKey,
        selectedSimulation,
        useHws,
        retry
      );

      const runtime = runtimeRef.current;
      if (!runtime) return;

      setTimeout(() => {
        !runtime.isDestroyed() && prepareSceneForHGK(runtime);
      }, 500);
      runtime.scene.requestRender();

      getProvider(runtime, hqKey, HGK_TERRAIN_PROVIDER_URLS).then((provider) => {
        if (
          currentAttemptRef.current !== attemptId ||
          !runtime ||
          runtime.isDestroyed()
        )
          return;

        if (provider && runtime.scene) {
          try {
            runtime.scene.terrainProvider = provider;
            runtime.scene.requestRender();
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
    runtimeRef,
    isRuntimeReady,
    HGK_KEYS,
    HGK_TERRAIN_PROVIDER_URLS,
    retryCount,
  ]);
};
