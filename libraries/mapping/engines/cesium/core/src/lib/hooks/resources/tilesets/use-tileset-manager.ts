import { useEffect, useRef, useCallback } from "react";
import { Cesium3DTileset, Scene } from "@carma/cesium";
import { useCesiumContext } from "../../../context";
import { CtxEvent } from "../../../context/cesium-context-event-map";
import type { TilesetConfig } from "../../../types";
import { TilesetContentTypes } from "@carma/types";
import { loadTileset } from "../../../loaders";
// DISABLED: Progress tracking temporarily disabled
// import { useTilesetProgress } from "./use-tileset-progress";

type LoadedTilesets = Map<string, Cesium3DTileset>;

const hideOtherMeshTilesets = (
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

export const useTilesetManager = (tilesets: TilesetConfig[]) => {
  const {
    sceneRef,
    subscribe,
    tilesetsRef: loadedTilesetsRef,
  } = useCesiumContext();

  console.log(
    "[TILESET|MANAGER] Initialized with tileset configs:",
    tilesets.map((t) => t.id)
  );

  // DISABLED: Progress tracking temporarily disabled
  // const { tilesetProgress, attachProgressListener, updateProgress } =
  //   useTilesetProgress(loadedTilesetsRef.current);

  const loadTilesetOnDemand = useCallback(
    async (config: TilesetConfig) => {
      const scene = sceneRef.current;
      if (!scene || loadedTilesetsRef.current.has(config.id)) return;

      try {
        console.log(
          `[CESIUM|TILESET] Loading tileset: ${config.id} from ${config.url}`
        );
        // Pass scene to tileset constructor - required for proper integration
        const tileset = await loadTileset(config, scene);

        // DISABLED: Progress tracking temporarily disabled
        // attachProgressListener(config.id, tileset);
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
    [sceneRef]
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
        console.log(
          `[TILESET|VIS] Config ${id} not in current tilesets array - will load on next render when resources update`
        );
        return;
      }

      console.log(
        `[TILESET|VIS] Config type: ${
          config.content?.contentType
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
        if (
          visible &&
          config.content?.contentType === TilesetContentTypes.MESH
        ) {
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
              tilesets.find((t) => t.id === tsId)?.content?.contentType
            }`
          );
        }
        console.groupEnd();

        sceneRef.current?.requestRender();
        // DISABLED: Progress tracking temporarily disabled
        // updateProgress();
      });
    };

    return subscribe(CtxEvent.SetTilesetVisibility, handleVisibilityChange);
  }, [subscribe, sceneRef, tilesets, loadTilesetOnDemand]);

  // DISABLED: Progress tracking temporarily disabled
  // return { tilesetProgress };
  return { tilesetProgress: [] };
};

export default useTilesetManager;
