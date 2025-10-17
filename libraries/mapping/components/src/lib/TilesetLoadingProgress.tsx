import { useEffect, useState } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium/core";

/**
 * TODO: Update to work with new CesiumContext structure that uses tilesetsRef Map
 * instead of primaryTilesetRef/secondaryTilesetRef
 */
export const TilesetLoadingProgress = () => {
  const { tilesetsRef } = useCesiumContext();
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // TODO: Implement with new Map-based tileset structure
    // For now, just return early to unblock build
    const tilesets = tilesetsRef.current;
    if (tilesets.size === 0) {
      setIsLoading(false);
      return;
    }

    // Get first tileset from map as active tileset
    const activeTileset = Array.from(tilesets.values())[0];
    if (!activeTileset) {
      setIsLoading(false);
      return;
    }

    let loadCounter = 0;

    const updateProgress = () => {
      loadCounter++;
      const estimatedProgress = Math.min(loadCounter * 5, 95);
      setProgress(estimatedProgress);
      setIsLoading(true);
    };

    const loadProgressListener =
      activeTileset.tileLoad.addEventListener(updateProgress);
    const allTilesLoadedListener =
      activeTileset.allTilesLoaded.addEventListener(() => {
        setProgress(100);
        setIsLoading(false);
      });

    const initialLoadListener =
      activeTileset.initialTilesLoaded.addEventListener(() => {
        updateProgress();
      });

    setIsLoading(true);
    updateProgress();

    return () => {
      activeTileset.tileLoad.removeEventListener(loadProgressListener);
      activeTileset.allTilesLoaded.removeEventListener(allTilesLoadedListener);
      activeTileset.initialTilesLoaded.removeEventListener(initialLoadListener);
    };
  }, [tilesetsRef]);

  if (!isLoading && progress >= 100) {
    return null;
  }

  return (
    <div className="fixed top-[60px] left-0 right-0 z-50 h-[2px] overflow-hidden">
      <div
        className="h-full bg-blue-500 transition-all duration-300 ease-out origin-left"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export default TilesetLoadingProgress;
