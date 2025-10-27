import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import type { ImageryLayer } from "@carma/cesium";
import { useCesiumContext } from "../../../context";
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
export const useImageryManager = (
  imageryConfigs: ImageryProviderConfig[],
  styleCallbacksRef?: MutableRefObject<{
    onImageryLayersChange?: (
      layers: Array<{ id: string; opacity: number }>
    ) => void;
  }>
) => {
  const { sceneRef } = useCesiumContext();

  // Scene-owned ref: Track loaded imagery layers (destroyed on unmount)
  const imageryLayersRef = useRef<Map<string, ImageryLayer>>(new Map());

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
    const checkSceneReady = () => {
      const scene = sceneRef.current;
      if (scene && scene.isDestroyed() === false) {
        console.debug(
          "[CESIUM|IMAGERY] Scene ready - imagery will load on-demand"
        );
      } else {
        // Scene not ready yet, check again in 100ms
        setTimeout(checkSceneReady, 100);
      }
    };

    // Start checking immediately
    checkSceneReady();

    return () => {
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
  }, [imageryConfigs, sceneRef, imageryLayersRef]);

  // Event subscriptions removed - using direct ref manipulation instead

  // Register callback for style changes
  useEffect(() => {
    if (!styleCallbacksRef) return;

    const handleImageryLayersChange = async (
      layers: Array<{ id: string; opacity: number }>
    ) => {
      console.log("[IMAGERY|STYLE] Style change received:", layers);

      const scene = sceneRef.current;
      if (!scene) return;

      // Hide all current imagery layers first
      for (const [id, layer] of imageryLayersRef.current) {
        if (!layer.isDestroyed() && scene.imageryLayers.contains(layer)) {
          layer.show = false;
        }
      }

      // Show and set opacity for requested layers
      for (const { id, opacity } of layers) {
        const layer = imageryLayersRef.current.get(id);
        if (
          layer &&
          !layer.isDestroyed() &&
          scene.imageryLayers.contains(layer)
        ) {
          layer.show = true;
          layer.alpha = opacity;
          console.log(
            `[IMAGERY|STYLE] Updated layer ${id}: show=true, opacity=${opacity}`
          );
        } else {
          // Load layer if not already loaded
          const imageryConfig = imageryConfigs.find(
            (ic) => getImageryId(ic) === id
          );
          if (imageryConfig) {
            console.log(`[IMAGERY|STYLE] Loading new layer: ${id}`);
            await loadImageryOnDemand(imageryConfig);
            const newLayer = imageryLayersRef.current.get(id);
            if (newLayer && !newLayer.isDestroyed()) {
              newLayer.alpha = opacity;
            }
          }
        }
      }

      scene.requestRender();
    };

    styleCallbacksRef.current.onImageryLayersChange = handleImageryLayersChange;

    return () => {
      if (styleCallbacksRef.current) {
        styleCallbacksRef.current.onImageryLayersChange = undefined;
      }
    };
  }, [styleCallbacksRef, sceneRef, imageryConfigs, loadImageryOnDemand]);
};

export default useImageryManager;
