import { useEffect, useRef, useCallback } from "react";
import { Cesium3DTileset, Scene } from "cesium";
import { useCesiumContext } from "../context";
import { CtxEvent } from "../context/cesiumContextEventMap";
import type { TilesetConfig } from "@carma/types";
import { TilesetTypes } from "@carma/types";
import { loadTileset } from "../providers";
import { useTilesetProgress } from "./useTilesetProgress";

type LoadedTilesets = Map<string, Cesium3DTileset>;

const hideOtherMeshTilesets = (
  currentId: string,
  tilesets: TilesetConfig[],
  loadedTilesets: LoadedTilesets
): void => {
  tilesets
    .filter((cfg) => cfg.type === TilesetTypes.MESH && cfg.id !== currentId)
    .forEach((cfg) => {
      const tileset = loadedTilesets.get(cfg.id);
      if (tileset && !tileset.isDestroyed() && tileset.show) {
        tileset.show = false;
      }
    });
};

const addTilesetToScene = (scene: Scene, tileset: Cesium3DTileset): void => {
  if (!scene.primitives.contains(tileset)) {
    scene.primitives.add(tileset);
  }
};

const configureTilesetDefaults = (tileset: Cesium3DTileset): void => {
  tileset.show = false;
  tileset.shadows = 0;
};

export const useTilesetManager = (tilesets: TilesetConfig[]) => {
  const { sceneRef, subscribe } = useCesiumContext();
  const loadedTilesetsRef = useRef<LoadedTilesets>(new Map());
  const { tilesetProgress, attachProgressListener, updateProgress } =
    useTilesetProgress(loadedTilesetsRef.current);

  const loadTilesetOnDemand = useCallback(
    async (config: TilesetConfig) => {
      const scene = sceneRef.current;
      if (!scene || loadedTilesetsRef.current.has(config.id)) return;

      try {
        // Pass scene to tileset constructor - required for proper integration
        const tileset = await loadTileset(config, scene);

        attachProgressListener(config.id, tileset);
        addTilesetToScene(scene, tileset);
        configureTilesetDefaults(tileset);
        loadedTilesetsRef.current.set(config.id, tileset);
        scene.requestRender();
      } catch (error) {
        console.error("[CESIUM|TILESET] Load error:", config.id, error);
      }
    },
    [sceneRef, attachProgressListener]
  );

  useEffect(() => {
    const unsubscribe = subscribe(CtxEvent.SceneReady, async () => {});

    return () => {
      unsubscribe();

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
  }, [sceneRef, subscribe]);

  useEffect(() => {
    const handleVisibilityChange = async ({
      id,
      visible,
    }: {
      id: string;
      visible: boolean;
    }) => {
      console.log(
        `[TILESET|VIS] Event received: ${id} -> ${visible ? "SHOW" : "HIDE"}`
      );

      const config = tilesets.find((t) => t.id === id);
      if (!config) {
        console.warn(`[CESIUM|TILESET] Config not found: ${id}`);
        return;
      }

      console.log(
        `[TILESET|VIS] Config type: ${
          config.type
        }, loaded: ${loadedTilesetsRef.current.has(id)}`
      );

      if (!loadedTilesetsRef.current.has(id) && visible) {
        await loadTilesetOnDemand(config);
      }

      const tileset = loadedTilesetsRef.current.get(id);
      if (!tileset || tileset.isDestroyed()) {
        console.log(`[TILESET|VIS] Tileset not available or destroyed: ${id}`);
        return;
      }

      console.log(`[TILESET|VIS] Before change - ${id}.show: ${tileset.show}`);

      requestAnimationFrame(() => {
        if (tileset.isDestroyed()) return;

        // Set visibility first
        tileset.show = visible;
        console.log(`[TILESET|VIS] After change - ${id}.show: ${tileset.show}`);

        // If showing a MESH, hide other MESH tilesets (only one MESH visible at a time)
        if (visible && config.type === TilesetTypes.MESH) {
          console.log(
            `[TILESET|VIS] Hiding other MESH tilesets because ${id} is being shown`
          );
          hideOtherMeshTilesets(id, tilesets, loadedTilesetsRef.current);
        }

        // Log all tileset states
        console.group(`[TILESET|VIS] All tileset states:`);
        for (const [tsId, ts] of loadedTilesetsRef.current) {
          console.log(
            `  ${tsId}: show=${ts.show}, type=${
              tilesets.find((t) => t.id === tsId)?.type
            }`
          );
        }
        console.groupEnd();

        sceneRef.current?.requestRender();
        updateProgress();
      });
    };

    return subscribe(CtxEvent.SetTilesetVisibility, handleVisibilityChange);
  }, [subscribe, sceneRef, tilesets, loadTilesetOnDemand, updateProgress]);

  return { tilesetProgress };
};

export default useTilesetManager;
