import { useEffect, useRef } from "react";
import type { Cesium3DTileset } from "@carma/cesium";
import { useCesiumContext } from "../../../context/hooks/use-cesium-context";

type LoadedTilesets = Map<string, Cesium3DTileset>;
type TileLoadCounters = Map<string, number>;

// Cesium3DTileset has a statistics property that's not in the type definition
type Cesium3DTilesetWithStats = Cesium3DTileset & {
  statistics?: {
    numberOfTilesProcessing?: number;
    numberOfTilesLoaded?: number;
  };
};

export const useTilesetProgress = (
  loadedTilesets: LoadedTilesets,
  minTileCount: number = 4,
  onTilesetPresentable?: (id: string) => void,
  onTilesetReady?: (id: string) => void
): {
  attachProgressListener: (id: string, tileset: Cesium3DTileset) => void;
  updateProgress: () => void;
} => {
  const { getSceneStyleReadyCallback } = useCesiumContext();
  const tileLoadCountersRef = useRef<TileLoadCounters>(new Map());
  const initialTilesFiredRef = useRef<Set<string>>(new Set());
  const hasEmittedReadyRef = useRef(false);

  const checkAndEmitSceneReady = () => {
    console.log(
      `[TILESET|PROGRESS] checkAndEmitSceneReady called (hasEmitted=${hasEmittedReadyRef.current})`
    );

    if (hasEmittedReadyRef.current) {
      console.log(`[TILESET|PROGRESS] Already emitted, skipping check`);
      return;
    }

    const visibleTilesets = Array.from(loadedTilesets.entries())
      .filter(([, tileset]) => tileset.show)
      .map(([id]) => id);

    console.log(`[TILESET|PROGRESS] Visible tilesets:`, visibleTilesets);

    if (visibleTilesets.length === 0) {
      console.log(`[TILESET|PROGRESS] No visible tilesets, skipping emit`);
      return;
    }

    const readinessStatus = visibleTilesets.map((id) => {
      const initialFired = initialTilesFiredRef.current.has(id);
      const tilesLoaded = tileLoadCountersRef.current.get(id) ?? 0;
      const isReady = initialFired && tilesLoaded >= minTileCount;
      return { id, initialFired, tilesLoaded, minTileCount, isReady };
    });

    console.log(`[TILESET|PROGRESS] Readiness status:`, readinessStatus);

    const allReady = readinessStatus.every((s) => s.isReady);

    if (allReady) {
      hasEmittedReadyRef.current = true;
      console.log(
        "[TILESET|PROGRESS] ✅ All visible tilesets ready, emitting SceneResourcesReady",
        readinessStatus.map((s) => `${s.id}: ${s.tilesLoaded} tiles`)
      );
      // Direct callback instead of event emission
      const callback = getSceneStyleReadyCallback();
      callback?.(true, "tilesets-ready");
    } else {
      console.log(`[TILESET|PROGRESS] Not all ready yet, waiting...`);
    }
  };

  const attachProgressListener = (id: string, tileset: Cesium3DTileset) => {
    // Check if tiles are already loaded (e.g., from cache)
    const tilesetWithStats = tileset as Cesium3DTilesetWithStats;
    const currentTilesProcessing =
      tilesetWithStats.statistics?.numberOfTilesProcessing ?? 0;
    const currentTilesLoaded =
      tilesetWithStats.statistics?.numberOfTilesLoaded ?? 0;
    const totalTiles = currentTilesProcessing + currentTilesLoaded;

    tileLoadCountersRef.current.set(id, totalTiles);

    if (totalTiles >= minTileCount) {
      console.log(
        `[TILESET|READY] ${id}: Already has tiles (processing=${currentTilesProcessing}, loaded=${currentTilesLoaded}, total=${totalTiles}, minRequired=${minTileCount})`
      );
      initialTilesFiredRef.current.add(id);
      onTilesetPresentable?.(id); // Report as presentable
      checkAndEmitSceneReady();
      return; // Skip event listeners
    }

    // Track tile loading to know when we have enough tiles
    const checkReadyState = () => {
      const tilesProcessing =
        tilesetWithStats.statistics?.numberOfTilesProcessing ?? 0;
      const tilesLoaded = tilesetWithStats.statistics?.numberOfTilesLoaded ?? 0;
      const totalTiles = tilesProcessing + tilesLoaded;

      tileLoadCountersRef.current.set(id, totalTiles);

      // Update progress visualization
      updateProgressState();

      const wasReady = initialTilesFiredRef.current.has(id);
      const isReady = totalTiles >= minTileCount;

      if (!wasReady && isReady) {
        console.log(
          `[TILESET|READY] ${id}: Reached minimum tiles (processing=${tilesProcessing}, loaded=${tilesLoaded}, total=${totalTiles}, minRequired=${minTileCount})`
        );
        initialTilesFiredRef.current.add(id);
        onTilesetPresentable?.(id);
        onTilesetReady?.(id);

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
      const tilesProcessing =
        tilesetWithStats.statistics?.numberOfTilesProcessing ?? 0;
      const tilesLoaded = tilesetWithStats.statistics?.numberOfTilesLoaded ?? 0;
      const totalTiles = tilesProcessing + tilesLoaded;
      const isReady = totalTiles >= minTileCount;

      console.log(
        `[TILESET|READY] ${id}: initialTilesLoaded event (processing=${tilesProcessing}, loaded=${tilesLoaded}, total=${totalTiles}, minRequired=${minTileCount}, ready=${isReady})`
      );

      if (isReady) {
        initialTilesFiredRef.current.add(id);
        tileLoadCountersRef.current.set(id, totalTiles);
        onTilesetPresentable?.(id);
        onTilesetReady?.(id);

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

  const updateProgressState = () => {
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

  return { attachProgressListener, updateProgress: updateProgressState };
};
