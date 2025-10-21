import { useEffect, useRef } from "react";
import type { Cesium3DTileset } from "@carma/cesium";
import { useCesiumContext } from "../../../context/hooks/use-cesium-context";
import { CtxEvent } from "../../../context/cesium-context-event-map";

type LoadedTilesets = Map<string, Cesium3DTileset>;
type TileLoadCounters = Map<string, number>;

export const useTilesetProgress = (
  loadedTilesets: LoadedTilesets,
  minTileCount: number = 4
) => {
  const { emit } = useCesiumContext();
  const tileLoadCountersRef = useRef<TileLoadCounters>(new Map());
  const initialTilesFiredRef = useRef<Set<string>>(new Set());
  const hasEmittedReadyRef = useRef(false);

  const checkAndEmitSceneReady = () => {
    if (hasEmittedReadyRef.current) return;

    const visibleTilesets = Array.from(loadedTilesets.entries())
      .filter(([, tileset]) => tileset.show)
      .map(([id]) => id);

    if (visibleTilesets.length === 0) return;

    const allReady = visibleTilesets.every((id) => {
      const initialFired = initialTilesFiredRef.current.has(id);
      const tilesLoaded = tileLoadCountersRef.current.get(id) ?? 0;
      return initialFired && tilesLoaded >= minTileCount;
    });

    if (allReady) {
      hasEmittedReadyRef.current = true;
      console.log(
        "[TILESET|PROGRESS] All visible tilesets ready, emitting SceneResourcesReady",
        visibleTilesets.map(
          (id) => `${id}: ${tileLoadCountersRef.current.get(id)} tiles`
        )
      );
      emit(CtxEvent.SceneResourcesReady);
    }
  };

  const attachProgressListener = (id: string, tileset: Cesium3DTileset) => {
    // Check if tiles are already loaded (e.g., from cache)
    const currentTilesProcessing = tileset.statistics?.numberOfTilesProcessing ?? 0;
    const currentTilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
    const totalTiles = currentTilesProcessing + currentTilesLoaded;
    
    tileLoadCountersRef.current.set(id, totalTiles);

    if (totalTiles >= minTileCount) {
      console.log(
        `[TILESET|READY] ${id}: Already has tiles (processing=${currentTilesProcessing}, loaded=${currentTilesLoaded}, total=${totalTiles}, minRequired=${minTileCount})`
      );
      initialTilesFiredRef.current.add(id);
      checkAndEmitSceneReady();
      return; // Skip event listeners
    }

    // Track tile loading to know when we have enough tiles
    const checkReadyState = () => {
      const tilesProcessing = tileset.statistics?.numberOfTilesProcessing ?? 0;
      const tilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
      const totalTiles = tilesProcessing + tilesLoaded;
      
      tileLoadCountersRef.current.set(id, totalTiles);

      const wasReady = initialTilesFiredRef.current.has(id);
      const isReady = totalTiles >= minTileCount;

      if (!wasReady && isReady) {
        console.log(
          `[TILESET|READY] ${id}: Reached minimum tiles (processing=${tilesProcessing}, loaded=${tilesLoaded}, total=${totalTiles}, minRequired=${minTileCount})`
        );
        initialTilesFiredRef.current.add(id);

        // Unregister listeners since we're now ready
        tileset.tileLoad.removeEventListener(checkReadyState);
        tileset.loadProgress.removeEventListener(handleLoadProgress);

        // Check if scene is ready
        checkAndEmitSceneReady();
      }
    };

    // Listen to loadProgress (fires continuously during loading)
    const handleLoadProgress = () => {
      checkReadyState();
    };
    
    tileset.loadProgress.addEventListener(handleLoadProgress);
    
    // Also listen to tileLoad as fallback
    tileset.tileLoad.addEventListener(checkReadyState);

    // Also check initial state (in case tiles loaded before listener attached)
    const handleInitialTilesLoaded = () => {
      const tilesProcessing = tileset.statistics?.numberOfTilesProcessing ?? 0;
      const tilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
      const totalTiles = tilesProcessing + tilesLoaded;
      const isReady = totalTiles >= minTileCount;

      console.log(
        `[TILESET|READY] ${id}: initialTilesLoaded event (processing=${tilesProcessing}, loaded=${tilesLoaded}, total=${totalTiles}, minRequired=${minTileCount}, ready=${isReady})`
      );

      if (isReady) {
        initialTilesFiredRef.current.add(id);
        tileLoadCountersRef.current.set(id, totalTiles);

        // Unregister all listeners since we're ready
        tileset.tileLoad.removeEventListener(checkReadyState);
        tileset.loadProgress.removeEventListener(handleLoadProgress);

        // Check if scene is ready
        checkAndEmitSceneReady();
      }

      // Always unregister this one-time event
      tileset.initialTilesLoaded.removeEventListener(handleInitialTilesLoaded);
    };

    // Register the initialTilesLoaded listener
    tileset.initialTilesLoaded.addEventListener(handleInitialTilesLoaded);
  };

  const updateProgress = () => {
    // Check scene readiness when tilesets visibility changes
    checkAndEmitSceneReady();
  };

  useEffect(() => {
    // Capture refs at effect setup time
    const tileLoadCounters = tileLoadCountersRef.current;
    const initialTilesFired = initialTilesFiredRef.current;

    return () => {
      tileLoadCounters.clear();
      initialTilesFired.clear();
      hasEmittedReadyRef.current = false;
    };
  }, []);

  useEffect(() => {
    hasEmittedReadyRef.current = false;
  }, [loadedTilesets]);

  return { attachProgressListener, updateProgress };
};
