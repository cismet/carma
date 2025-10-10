import { useEffect, useState } from "react";
import { useCesiumContext } from "@carma-mapping/engines/cesium";

export const TilesetLoadingProgress = () => {
  const { primaryTilesetRef, secondaryTilesetRef, tilesetVisibilityRef } =
    useCesiumContext();
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const primaryVisible = tilesetVisibilityRef.current.get("primary") ?? false;
    const secondaryVisible =
      tilesetVisibilityRef.current.get("secondary") ?? true;

    const activeTileset = secondaryVisible
      ? secondaryTilesetRef.current
      : primaryVisible
      ? primaryTilesetRef.current
      : null;

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
  }, [primaryTilesetRef, secondaryTilesetRef, tilesetVisibilityRef]);

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
