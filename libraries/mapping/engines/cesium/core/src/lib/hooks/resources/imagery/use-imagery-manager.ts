import { useEffect, useCallback } from "react";
import type { ImageryLayer } from "@carma/cesium";
import { useCesiumContext } from "../../../context";
import { CtxEvent } from "../../../context/cesium-context-event-map";
import { loadCesiumImageryLayer } from "../../../loaders";
import type { ImageryProviderConfig } from "@carma/cesium/types";

/**
 * Get imagery ID - use explicit layer field or extract from config
 */
const getImageryId = (config: ImageryProviderConfig): string => {
  return config.id;
};

/**
 * Manages multiple imagery layers with key-based deduplication
 * Prevents adding the same imagery layer twice to the scene
 */
export const useImageryManager = (imageryConfigs: ImageryProviderConfig[]) => {
  const { sceneRef, subscribe, imageryLayersRef } = useCesiumContext();

  console.log(
    "[IMAGERY|MANAGER] Initialized with configs:",
    imageryConfigs.map((ic) => ic.id)
  );

  // Helper function to load imagery on-demand
  const loadImageryOnDemand = useCallback(
    async (imageryConfig: ImageryProviderConfig) => {
      const scene = sceneRef.current;
      if (!scene) return;

      const id = getImageryId(imageryConfig);

      // Count current imagery layers in scene
      console.log(
        `[CESIUM|IMAGERY] Scene has ${scene.imageryLayers.length} imagery layers before loading ${id}`
      );

      if (imageryLayersRef.current.has(id)) {
        const existingLayer = imageryLayersRef.current.get(id);
        const isInScene =
          existingLayer && scene.imageryLayers.contains(existingLayer);
        console.log(
          `[CESIUM|IMAGERY] Already loaded: ${id} (in scene: ${isInScene})`
        );
        return;
      }

      try {
        console.debug("[CESIUM|IMAGERY] Lazy loading:", id);

        const abortController = new AbortController();
        const layerRef = { current: null as ImageryLayer | null };

        await loadCesiumImageryLayer(
          layerRef,
          imageryConfig,
          abortController.signal
        );

        if (layerRef.current && !abortController.signal.aborted) {
          // Check if layer is already in scene before adding
          if (!scene.imageryLayers.contains(layerRef.current)) {
            scene.imageryLayers.add(layerRef.current);
            console.log(`[CESIUM|IMAGERY] ✓ Added to scene: ${id}`);
          } else {
            console.warn(
              `[CESIUM|IMAGERY] ⚠️ Layer already in scene, skipping add: ${id}`
            );
          }

          // Start hidden - visibility controlled by scene styles
          layerRef.current.show = false;
          imageryLayersRef.current.set(id, layerRef.current);
          scene.requestRender();

          // Count imagery layers after adding
          console.log(
            `[CESIUM|IMAGERY] Scene now has ${scene.imageryLayers.length} imagery layers after loading ${id}`
          );
        }
      } catch (error) {
        console.error("[CESIUM|IMAGERY] Load error:", id, error);
      }
    },
    [sceneRef, imageryLayersRef]
  );

  // Scene ready - don't load imagery yet, just mark as ready
  useEffect(() => {
    const unsubscribe = subscribe(CtxEvent.SceneReady, async () => {
      console.debug(
        "[CESIUM|IMAGERY] Scene ready - imagery will load on-demand"
      );
    });

    return () => {
      unsubscribe();

      // Cleanup on unmount
      const scene = sceneRef.current;
      if (scene && !scene.isDestroyed()) {
        for (const [id, layer] of imageryLayersRef.current) {
          if (!layer.isDestroyed() && scene.imageryLayers.contains(layer)) {
            scene.imageryLayers.remove(layer);
          }
        }
      }
      imageryLayersRef.current.clear();
    };
  }, [imageryConfigs, sceneRef, subscribe, imageryLayersRef]);

  // Subscribe to imagery layer visibility events - load on first visibility request
  useEffect(() => {
    const unsubscribe = subscribe(
      CtxEvent.SetImageryVisibility,
      async (payload: any) => {
        console.log(`[IMAGERY|VIS] Raw event payload:`, payload);
        const { id, visible } = payload || {};
        console.log(
          `[IMAGERY|VIS] Event received: ${id} -> ${visible ? "SHOW" : "HIDE"}`
        );

        // Find the imagery config
        const imageryConfig = imageryConfigs.find(
          (ic) => getImageryId(ic) === id
        );
        if (!imageryConfig) {
          console.warn("[IMAGERY|VIS] Config not found for:", id);
          console.log(
            "[IMAGERY|VIS] Available configs:",
            imageryConfigs.map((ic) => ic.id)
          );
          return;
        }

        // Lazy load if not already loaded and being made visible
        if (!imageryLayersRef.current.has(id) && visible) {
          console.debug(
            "[CESIUM|IMAGERY] Lazy loading on first visibility:",
            id
          );
          await loadImageryOnDemand(imageryConfig);
        }

        // Update visibility - use requestAnimationFrame to avoid race conditions
        const layer = imageryLayersRef.current.get(id);
        if (layer && !layer.isDestroyed()) {
          requestAnimationFrame(() => {
            if (!layer.isDestroyed()) {
              layer.show = visible;
              console.log(
                `[CESIUM|IMAGERY] ${
                  visible ? "✓ SHOWN" : "✗ HIDDEN"
                }: ${id} (show=${layer.show})`
              );
              sceneRef.current?.requestRender();
            }
          });
        }
      }
    );

    return unsubscribe;
  }, [
    subscribe,
    sceneRef,
    imageryConfigs,
    imageryLayersRef,
    loadImageryOnDemand,
  ]);

  // Subscribe to imagery layer opacity events
  useEffect(() => {
    const unsubscribe = subscribe(
      CtxEvent.SetImageryOpacity,
      ({ id, opacity }: { id: string; opacity: number }) => {
        const layer = imageryLayersRef.current.get(id);
        if (layer && !layer.isDestroyed()) {
          layer.alpha = opacity;
          console.debug("[CESIUM|IMAGERY] Opacity:", id, opacity);
          sceneRef.current?.requestRender();
        }
      }
    );

    return unsubscribe;
  }, [subscribe, sceneRef, imageryLayersRef]);
};

export default useImageryManager;
