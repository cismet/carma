import { useCallback, useState } from "react";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

export const useMeshToggle = () => {
  const { switchPrimaryTileset, primaryTilesetOptions } = useCesiumContext();
  const [currentIndex, setCurrentIndex] = useState(0);

  const toggleMesh = useCallback(() => {
    if (!switchPrimaryTileset || !primaryTilesetOptions) return;

    const nextIndex = (currentIndex + 1) % primaryTilesetOptions.length;
    setCurrentIndex(nextIndex);
    switchPrimaryTileset(nextIndex);
  }, [currentIndex, primaryTilesetOptions, switchPrimaryTileset]);

  const currentOption = primaryTilesetOptions?.[currentIndex];

  return {
    currentOption,
    primaryTilesetOptions,
    toggleMesh,
    hasMultipleOptions: (primaryTilesetOptions?.length || 0) > 1,
  };
};
