import { useState, useRef, useEffect } from "react";
import { Cesium3DTileset } from "@carma/cesium";

export type TilesetProgress = {
  id: string;
  progress: number;
  visible: boolean;
  allTilesLoaded: boolean;
};

type ProgressTrackers = Map<string, number>;
type LoadedTilesets = Map<string, Cesium3DTileset>;

const calculateProgress = (pending: number, processing: number): number => {
  const isLoading = pending + processing > 0;
  const total = pending + processing;
  return isLoading ? Math.max(0, 100 - total) : 100;
};

const buildProgressData = (
  progressTrackers: ProgressTrackers,
  loadedTilesets: LoadedTilesets
): TilesetProgress[] =>
  Array.from(progressTrackers.entries()).map(([id, progress]) => {
    const tileset = loadedTilesets.get(id);
    return {
      id,
      progress,
      visible: tileset?.show ?? false,
      allTilesLoaded: tileset?.allTilesLoaded ? true : false,
    };
  });

export const useTilesetProgress = (loadedTilesets: LoadedTilesets) => {
  const [tilesetProgress, setTilesetProgress] = useState<TilesetProgress[]>([]);
  const progressTrackersRef = useRef<ProgressTrackers>(new Map());

  const attachProgressListener = (id: string, tileset: Cesium3DTileset) => {
    tileset.loadProgress.addEventListener(
      (pending: number, processing: number) => {
        const progress = calculateProgress(pending, processing);
        const isLoading = pending + processing > 0;

        console.log(
          `[TILESET|PROGRESS] ${id}: pending=${pending}, processing=${processing}, total=${
            pending + processing
          }, loading=${isLoading}`
        );

        progressTrackersRef.current.set(id, progress);
        setTilesetProgress(
          buildProgressData(progressTrackersRef.current, loadedTilesets)
        );
      }
    );
  };

  const updateProgress = () => {
    setTilesetProgress(
      buildProgressData(progressTrackersRef.current, loadedTilesets)
    );
  };

  useEffect(() => {
    return () => {
      progressTrackersRef.current.clear();
    };
  }, []);

  return {
    tilesetProgress,
    attachProgressListener,
    updateProgress,
  };
};
