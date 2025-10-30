import { useEffect, useCallback, useRef, type MutableRefObject } from "react";
import type { Cesium3DTileset, Scene } from "@carma/cesium";
import { useCesiumContext } from "../../../context";
import type { TilesetConfig } from "@carma/cesium/types";
import { loadTileset } from "../../../loaders";
import { useTilesetProgress } from "./use-tileset-progress";

type LoadedTilesets = Map<string, Cesium3DTileset>;

// MESH mutual exclusion is now handled by style config
// Each style specifies exactly which tilesets to show (e.g., mesh-2024 shows only wupp-mesh-2024)
// No need for runtime MESH hiding logic anymore - keeping this for reference
/*
const _unused_hideOtherMeshTilesets = (
  currentId: string,
  tilesets: TilesetConfig[],
  loadedTilesets: LoadedTilesets
): void => {
  tilesets
    .filter(
      (cfg) =>
        cfg.content?.contentType === TilesetContentTypes.MESH &&
        cfg.id !== currentId
    )
    .forEach((cfg) => {
      const tileset = loadedTilesets.get(cfg.id);
      if (tileset && !tileset.isDestroyed() && tileset.show) {
        tileset.show = false;
      }
    });
};
*/

const addTilesetToScene = (scene: Scene, tileset: Cesium3DTileset): void => {
  if (!scene.primitives.contains(tileset)) {
    scene.primitives.add(tileset);
    console.log(
      `[CESIUM|TILESET] ✓ Added to scene.primitives (total: ${scene.primitives.length})`
    );
  }
};

const configureTilesetDefaults = (tileset: Cesium3DTileset): void => {
  tileset.show = false;
  tileset.shadows = 0;
};

export const useTilesetManager = (
  tilesets: TilesetConfig[],
  styleCallbacksRef: MutableRefObject<{
    onTilesetsChange?: (tilesetRefs: Array<{ id: string }>) => void;
  }>,
  trackProgress: boolean = false,
  onTilesetReady?: (id: string) => void
) => {
  const { sceneRef, config } = useCesiumContext();

  // Scene-owned ref: Track loaded tilesets (destroyed on unmount)
  const loadedTilesetsRef = useRef<Map<string, Cesium3DTileset>>(new Map());

  const minTileCount = config.minInitialTilesetTileCount ?? 4;

  console.log(
    "[TILESET|MANAGER] Initialized with tileset configs:",
    tilesets.map((t) => t.id),
    `minTileCount=${minTileCount}, trackProgress=${trackProgress}`
  );

  // Track tileset progress for SceneResourcesReady event
  const { attachProgressListener, updateProgress } = useTilesetProgress(
    loadedTilesetsRef.current,
    minTileCount,
    undefined,
    onTilesetReady
  );

  const loadTilesetOnDemand = useCallback(
    async (config: TilesetConfig) => {
      const scene = sceneRef.current;
      if (!scene) {
        console.error("[CESIUM|TILESET] Scene not available");
        return;
      }

      console.log(`[CESIUM|TILESET] Loading: ${config.id}`);
      try {
        const tileset = await loadTileset(config, scene);

        attachProgressListener(config.id, tileset);
        addTilesetToScene(scene, tileset);
        configureTilesetDefaults(tileset);
        loadedTilesetsRef.current.set(config.id, tileset);
        console.log(`[CESIUM|TILESET] ✓ Successfully loaded: ${config.id}`);
        scene.requestRender();
      } catch (error) {
        console.error("[CESIUM|TILESET] ✗ Load error:", config.id, error);
        throw error;
      }
    },
    [sceneRef, attachProgressListener]
  );

  // Register callback SYNCHRONOUSLY during render (NOT in useEffect)
  // This ensures callback is ready when useSceneStyleSwitcher calls it
  // Must be after loadTilesetOnDemand is defined to avoid closure issues
  console.log(
    "[TILESET|MANAGER] Registering onTilesetsChange callback (synchronous)"
  );

  styleCallbacksRef.current.onTilesetsChange = async (tilesetRefs) => {
    const scene = sceneRef.current;
    if (!scene) {
      console.warn(
        "[TILESET|MANAGER] Scene not available for tileset visibility change"
      );
      return;
    }

    console.log(
      "[TILESET|MANAGER] onTilesetsChange called with:",
      tilesetRefs.map((t) => t.id)
    );

    // Hide all tilesets first
    for (const [id, tileset] of loadedTilesetsRef.current) {
      if (!tileset.isDestroyed()) {
        tileset.show = false;
        console.log(`[TILESET|MANAGER] Hiding tileset: ${id}`);
      }
    }

    // Load and show requested tilesets
    for (const ref of tilesetRefs) {
      const config = tilesets.find((t) => t.id === ref.id);
      if (!config) {
        console.warn(`[TILESET|MANAGER] Config not found for: ${ref.id}`);
        continue;
      }

      // Load if not already loaded
      if (!loadedTilesetsRef.current.has(ref.id)) {
        console.log(`[TILESET|MANAGER] Loading tileset: ${ref.id}`);
        await loadTilesetOnDemand(config);
      }

      // Show the tileset
      const tileset = loadedTilesetsRef.current.get(ref.id);
      if (tileset && !tileset.isDestroyed()) {
        tileset.show = true;
        console.log(
          `[TILESET|MANAGER] ✓ Set visible: ${ref.id} (show=${tileset.show})`
        );
      }
    }

    // Log state before calling updateProgress
    console.log(
      `[TILESET|MANAGER] Calling updateProgress - loaded tilesets:`,
      Array.from(loadedTilesetsRef.current.entries()).map(
        ([id, t]) => `${id}(show=${t.show})`
      )
    );

    // Update progress tracking for SceneResourcesReady event
    updateProgress();
    scene.requestRender();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Unregister callback on unmount
      styleCallbacksRef.current.onTilesetsChange = undefined;

      // Destroy all loaded tilesets
      const scene = sceneRef.current;
      if (scene && !scene.isDestroyed()) {
        for (const [, tileset] of loadedTilesetsRef.current) {
          if (!tileset.isDestroyed() && scene.primitives.contains(tileset)) {
            scene.primitives.remove(tileset);
            tileset.destroy();
          }
        }
      }
      loadedTilesetsRef.current.clear();
    };
    // Note: Refs are stable and don't need to be in dependency array
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
};

export default useTilesetManager;
