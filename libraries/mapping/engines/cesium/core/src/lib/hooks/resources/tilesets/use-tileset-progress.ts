import { useEffect, useRef } from "react";
import type { Cesium3DTileset } from "@carma/cesium";
import { useCesiumContext } from "../../../context/hooks/use-cesium-context";
import { CtxEvent } from "../../../context/cesium-context-event-map";

type LoadedTilesets = Map<string, Cesium3DTileset>;
type ProgressTrackers = Map<string, number>;
type TileLoadCounters = Map<string, number>;

const calculateProgress = (pending: number, processing: number): number => {
  const isLoading = pending + processing > 0;
  const total = pending + processing;
  return isLoading ? Math.max(0, 100 - total) : 100;
};

export const useTilesetProgress = (
  loadedTilesets: LoadedTilesets,
  minTileCount: number = 4,
  enabled: boolean = false // Only for UI progress bars
) => {
  const { emit } = useCesiumContext();
  const progressTrackersRef = useRef<ProgressTrackers>(new Map());
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
    const currentTilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
    tileLoadCountersRef.current.set(id, currentTilesLoaded);

    if (currentTilesLoaded >= minTileCount) {
      console.log(
        `[TILESET|READY] ${id}: Already loaded (tilesLoaded=${currentTilesLoaded}, minRequired=${minTileCount})`
      );
      initialTilesFiredRef.current.add(id);
      checkAndEmitSceneReady();
      return; // Skip event listeners
    }

    // Track tile loading to know when we have enough tiles
    const handleTileLoad = () => {
      const tilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
      tileLoadCountersRef.current.set(id, tilesLoaded);

      const wasReady = initialTilesFiredRef.current.has(id);
      const isReady = tilesLoaded >= minTileCount;

      if (!wasReady && isReady) {
        console.log(
          `[TILESET|READY] ${id}: Reached minimum tiles (tilesLoaded=${tilesLoaded}, minRequired=${minTileCount})`
        );
        initialTilesFiredRef.current.add(id);

        // Unregister since we're now ready
        tileset.tileLoad.removeEventListener(handleTileLoad);

        // Check if scene is ready
        checkAndEmitSceneReady();
      }
    };

    // Start listening for tile loads immediately
    tileset.tileLoad.addEventListener(handleTileLoad);

    // Also check initial state (in case tiles loaded before listener attached)
    const handleInitialTilesLoaded = () => {
      const tilesLoaded = tileset.statistics?.numberOfTilesLoaded ?? 0;
      const isReady = tilesLoaded >= minTileCount;

      console.log(
        `[TILESET|READY] ${id}: initialTilesLoaded event (tilesLoaded=${tilesLoaded}, minRequired=${minTileCount}, ready=${isReady})`
      );

      if (isReady) {
        initialTilesFiredRef.current.add(id);
        tileLoadCountersRef.current.set(id, tilesLoaded);

        // Unregister tile load listener since we're ready
        tileset.tileLoad.removeEventListener(handleTileLoad);

        // Check if scene is ready
        checkAndEmitSceneReady();
      }

      // Always unregister this one-time event
      tileset.initialTilesLoaded.removeEventListener(handleInitialTilesLoaded);
    };

    // Register the initialTilesLoaded listener
    tileset.initialTilesLoaded.addEventListener(handleInitialTilesLoaded);

    // Optional: Start tracking ongoing progress for UI (only if enabled)
    if (enabled) {
      const handleLoadProgress = (pending: number, processing: number) => {
        const progress = calculateProgress(pending, processing);
        progressTrackersRef.current.set(id, progress);

        console.log(
          `[TILESET|PROGRESS] ${id}: pending=${pending}, processing=${processing}, progress=${progress}%`
        );
      };

      tileset.loadProgress.addEventListener(handleLoadProgress);
    }
  };

  const updateProgress = () => {
    // Check scene readiness when tilesets visibility changes
    checkAndEmitSceneReady();
  };

  useEffect(() => {
    // Capture refs at effect setup time
    const progressTrackers = progressTrackersRef.current;
    const tileLoadCounters = tileLoadCountersRef.current;
    const initialTilesFired = initialTilesFiredRef.current;

    return () => {
      progressTrackers.clear();
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
