import { useEffect, useRef } from "react";
import {
  EllipsoidTerrainProvider,
  type CesiumTerrainProvider,
} from "@carma/cesium";
import { useCesiumContext } from "../../../context";
import { CtxEvent } from "../../../context/cesium-context-event-map";
import { loadCesiumTerrainProvider } from "../../../loaders";
import type { CesiumTerrainProviderConfig } from "@carma/cesium/types";

/**
 * Get terrain ID - use explicit id field or extract from config
 */
const getTerrainId = (config: CesiumTerrainProviderConfig): string => {
  return config.id;
};

/**
 * Manages terrain providers with support for switching between them
 * Only one terrain provider can be active at a time
 */
export const useTerrainManager = (
  terrainConfigs: CesiumTerrainProviderConfig[]
) => {
  const { sceneRef, subscribe } = useCesiumContext();

  // Track loaded terrain providers by id
  const loadedProvidersRef = useRef<Map<string, CesiumTerrainProvider>>(
    new Map()
  );
  const activeProviderIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribe(CtxEvent.SceneReady, async () => {
      const scene = sceneRef.current;
      if (!scene) return;

      // Get IDs we want to have loaded
      const desiredIds = new Set(terrainConfigs.map((c) => getTerrainId(c)));

      // Remove providers that are no longer needed
      for (const [id, provider] of loadedProvidersRef.current) {
        if (!desiredIds.has(id)) {
          console.debug("[CESIUM|TERRAIN] Removing provider:", id);
          loadedProvidersRef.current.delete(id);
        }
      }

      console.log(
        `[CESIUM|TERRAIN] Managing ${terrainConfigs.length} terrain providers, currently loaded: ${loadedProvidersRef.current.size}`
      );

      // Load new providers that aren't already loaded
      for (const terrainConfig of terrainConfigs) {
        const id = getTerrainId(terrainConfig);

        if (loadedProvidersRef.current.has(id)) {
          console.log(
            `[CESIUM|TERRAIN] Already loaded: ${id} (active: ${
              activeProviderIdRef.current === id
            })`
          );
          continue;
        }

        try {
          console.debug("[CESIUM|TERRAIN] Loading:", id, terrainConfig.url);

          let provider: CesiumTerrainProvider;

          // Check metadata for terrain type, default to cesium
          const isEllipsoid =
            terrainConfig.metadata?.surfaceType === "ellipsoid";

          if (isEllipsoid) {
            // Use basic ellipsoid (no real terrain data)
            provider =
              new EllipsoidTerrainProvider() as unknown as CesiumTerrainProvider;
          } else {
            // Load cesium terrain provider
            const abortController = new AbortController();
            const providerRef = {
              current: null as CesiumTerrainProvider | null,
            };

            await loadCesiumTerrainProvider(
              providerRef,
              terrainConfig.url,
              abortController.signal
            );

            if (!providerRef.current || abortController.signal.aborted) {
              console.error("[CESIUM|TERRAIN] Failed to load:", id);
              continue;
            }
            provider = providerRef.current;
          }

          loadedProvidersRef.current.set(id, provider);
          console.log(`[CESIUM|TERRAIN] ✓ Loaded provider: ${id}`);

          // Set as active if it's the first one
          if (!activeProviderIdRef.current && terrainConfigs.length > 0) {
            scene.terrainProvider = provider;
            activeProviderIdRef.current = id;
            console.log(`[CESIUM|TERRAIN] ✓ Set as active: ${id}`);
            scene.requestRender();
          }
        } catch (error) {
          console.error("[CESIUM|TERRAIN] Load error:", id, error);
        }
      }
    });

    return () => {
      unsubscribe();
      loadedProvidersRef.current.clear();
      activeProviderIdRef.current = null;
    };
  }, [terrainConfigs, sceneRef, subscribe]);

  // Subscribe to terrain provider switch events
  useEffect(() => {
    const unsubscribe = subscribe(
      CtxEvent.SetTerrainProvider,
      ({ id }: { id: string }) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const provider = loadedProvidersRef.current.get(id);
        if (provider) {
          const previousProvider = activeProviderIdRef.current;
          scene.terrainProvider = provider;
          scene.globe.show = true;
          activeProviderIdRef.current = id;
          console.log(
            `[CESIUM|TERRAIN] ✓ Switched to provider: ${id} (from: ${
              previousProvider || "none"
            })`
          );
          scene.requestRender();
        } else {
          console.warn(`[CESIUM|TERRAIN] ⚠️ Provider not found: ${id}`);
        }
      }
    );

    return unsubscribe;
  }, [subscribe, sceneRef]);
};

export default useTerrainManager;
