import { useEffect, useRef } from "react";
import { ImageryLayer } from "cesium";
import { useCesiumContext } from "../context";
import { CtxEvent } from "../context/cesiumContextEventMap";
import type { ImageryProviderRecord } from "@carma/types";
import { loadCesiumImageryLayer } from "../providers";

/**
 * Get imagery ID - use explicit layer field or extract from config
 */
const getImageryId = (record: ImageryProviderRecord): string => {
  if (record.layer) return record.layer;

  // Extract from config
  const config = record.config as any;
  if (config.layer) return config.layer;
  if (config.layers) return config.layers; // WMS uses 'layers'

  // Fallback to URL-based ID
  return config.url || "imagery-" + Math.random().toString(36).substr(2, 9);
};

/**
 * Manages multiple imagery layers with key-based deduplication
 * Prevents adding the same imagery layer twice to the scene
 */
export const useImageryManager = (imageryConfigs: ImageryProviderRecord[]) => {
  const { sceneRef, subscribe } = useCesiumContext();

  // Track loaded imagery layers by id
  const loadedLayersRef = useRef<Map<string, ImageryLayer>>(new Map());

  // Helper function to load imagery on-demand
  const loadImageryOnDemand = async (imageryConfig: ImageryProviderRecord) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const id = getImageryId(imageryConfig);

    // Count current imagery layers in scene
    console.log(
      `[CESIUM|IMAGERY] Scene has ${scene.imageryLayers.length} imagery layers before loading ${id}`
    );

    if (loadedLayersRef.current.has(id)) {
      const existingLayer = loadedLayersRef.current.get(id);
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
        imageryConfig.config,
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
        loadedLayersRef.current.set(id, layerRef.current);
        scene.requestRender();

        // Count imagery layers after adding
        console.log(
          `[CESIUM|IMAGERY] Scene now has ${scene.imageryLayers.length} imagery layers after loading ${id}`
        );
      }
    } catch (error) {
      console.error("[CESIUM|IMAGERY] Load error:", id, error);
    }
  };

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
        for (const [id, layer] of loadedLayersRef.current) {
          if (!layer.isDestroyed() && scene.imageryLayers.contains(layer)) {
            scene.imageryLayers.remove(layer);
          }
        }
      }
      loadedLayersRef.current.clear();
    };
  }, [imageryConfigs, sceneRef, subscribe]);

  // Subscribe to imagery layer visibility events - load on first visibility request
  useEffect(() => {
    const unsubscribe = subscribe(
      CtxEvent.SetImageryVisibility,
      async ({ id, visible }: { id: string; visible: boolean }) => {
        // Find the imagery config
        const imageryConfig = imageryConfigs.find(
          (ic) => getImageryId(ic) === id
        );
        if (!imageryConfig) {
          console.warn("[CESIUM|IMAGERY] Config not found for:", id);
          return;
        }

        // Lazy load if not already loaded and being made visible
        if (!loadedLayersRef.current.has(id) && visible) {
          console.debug(
            "[CESIUM|IMAGERY] Lazy loading on first visibility:",
            id
          );
          await loadImageryOnDemand(imageryConfig);
        }

        // Update visibility - use requestAnimationFrame to avoid race conditions
        const layer = loadedLayersRef.current.get(id);
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
  }, [subscribe, sceneRef, imageryConfigs]);

  // Subscribe to imagery layer opacity events
  useEffect(() => {
    const unsubscribe = subscribe(
      CtxEvent.SetImageryOpacity,
      ({ id, opacity }: { id: string; opacity: number }) => {
        const layer = loadedLayersRef.current.get(id);
        if (layer && !layer.isDestroyed()) {
          layer.alpha = opacity;
          console.debug("[CESIUM|IMAGERY] Opacity:", id, opacity);
          sceneRef.current?.requestRender();
        }
      }
    );

    return unsubscribe;
  }, [subscribe, sceneRef]);
};

export default useImageryManager;
