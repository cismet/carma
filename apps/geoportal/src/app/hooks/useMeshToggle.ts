import { useCallback } from "react";
import { useCesiumContext } from "@carma-mapping/cesium-engine";

export const useMeshToggle = () => {
  const { 
    shouldSelectPrimaryTileset, 
    primaryTilesetConfigs, 
    selectedPrimaryTilesetIndex 
  } = useCesiumContext();

  const toggleMesh = useCallback(() => {
    if (!shouldSelectPrimaryTileset || !primaryTilesetConfigs) return;

    const currentIndex = selectedPrimaryTilesetIndex ?? 0;
    const nextIndex = (currentIndex + 1) % primaryTilesetConfigs.length;
    shouldSelectPrimaryTileset(nextIndex);
  }, [selectedPrimaryTilesetIndex, primaryTilesetConfigs, shouldSelectPrimaryTileset]);

  const currentOption = primaryTilesetConfigs?.[selectedPrimaryTilesetIndex ?? 0];

  return {
    currentOption,
    primaryTilesetOptions: primaryTilesetConfigs,
    toggleMesh,
    hasMultipleOptions: (primaryTilesetConfigs?.length || 0) > 1,
    currentIndex: selectedPrimaryTilesetIndex ?? 0,
  };
};
