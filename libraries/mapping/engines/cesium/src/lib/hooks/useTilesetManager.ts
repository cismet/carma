import { useEffect, useState, useRef } from "react";
import { Cesium3DTileset } from "cesium";
import { useCesiumContext } from "./useCesiumContext";
import { CtxEvent } from "../cesiumContextEventMap";
import type { TilesetConfig } from "@carma/types";
import { loadTileset } from "../utils/cesiumTilesetProviders";

/**
 * Manages multiple tilesets with key-based deduplication
 * Prevents adding the same tileset twice to the scene
 */
export const useTilesetManager = (tilesets: TilesetConfig[]) => {
  const { sceneRef, subscribe } = useCesiumContext();
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [showSplash, setShowSplash] = useState(true);

  // Track loaded tilesets by key
  const loadedTilesetsRef = useRef<Map<string, Cesium3DTileset>>(new Map());
  const progressTrackersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsubscribe = subscribe(CtxEvent.SceneReady, async () => {
      const scene = sceneRef.current;
      if (!scene) return;

      // Get keys we want to have loaded
      const desiredKeys = new Set(tilesets.map((t) => t.key));

      // Remove tilesets that are no longer needed
      for (const [key, tileset] of loadedTilesetsRef.current) {
        if (!desiredKeys.has(key)) {
          console.debug("[CESIUM|TILESET] Removing tileset:", key);
          if (!tileset.isDestroyed() && scene.primitives.contains(tileset)) {
            scene.primitives.remove(tileset);
            tileset.destroy();
          }
          loadedTilesetsRef.current.delete(key);
          progressTrackersRef.current.delete(key);
        }
      }

      // Add new tilesets that aren't already loaded
      for (const config of tilesets) {
        if (loadedTilesetsRef.current.has(config.key)) {
          console.debug(
            "[CESIUM|TILESET] Already loaded, skipping:",
            config.key
          );
          continue;
        }

        try {
          console.debug("[CESIUM|TILESET] Loading:", config.key, config.url);

          const tileset = await loadTileset(config);

          // Track progress
          tileset.loadProgress.addEventListener(
            (queued, processing, processed, failed) => {
              const total = queued + processing + processed + failed;
              if (total > 0) {
                const progress = (processed / total) * 100;
                progressTrackersRef.current.set(config.key, progress);

                // Calculate overall progress
                const allProgress = Array.from(
                  progressTrackersRef.current.values()
                );
                const avgProgress =
                  allProgress.reduce((a, b) => a + b, 0) / allProgress.length;
                setLoadingProgress(avgProgress);

                if (avgProgress > 0 && showSplash) {
                  setShowSplash(false);
                }
              }
            }
          );

          scene.primitives.add(tileset);
          loadedTilesetsRef.current.set(config.key, tileset);

          console.debug("[CESIUM|TILESET] Added to scene:", config.key);
        } catch (error) {
          console.error("[CESIUM|TILESET] Load error:", config.key, error);
          setShowSplash(false);
        }
      }
    });

    return () => {
      unsubscribe();

      // Cleanup on unmount
      const scene = sceneRef.current;
      if (scene && !scene.isDestroyed()) {
        for (const [key, tileset] of loadedTilesetsRef.current) {
          if (!tileset.isDestroyed() && scene.primitives.contains(tileset)) {
            scene.primitives.remove(tileset);
            tileset.destroy();
          }
        }
      }
      loadedTilesetsRef.current.clear();
      progressTrackersRef.current.clear();
    };
  }, [tilesets, sceneRef, subscribe, showSplash]);

  return { loadingProgress, showSplash };
};

export default useTilesetManager;
