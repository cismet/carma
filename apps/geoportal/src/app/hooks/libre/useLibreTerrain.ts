import { useCallback, useState } from "react";

import type { Map as MaplibreMap } from "maplibre-gl";

const TERRAIN_SOURCE_ID = "terrainSource";
const TERRAIN_EXAGGERATION = 1;

export const useLibreTerrain = (libreMap: MaplibreMap | null | undefined) => {
  const [isTerrainEnabled, setIsTerrainEnabled] = useState(false);

  const toggleTerrain = useCallback(() => {
    if (!libreMap) {
      return;
    }
    if (libreMap.terrain) {
      libreMap.setTerrain(null);
      setIsTerrainEnabled(false);
    } else {
      libreMap.setTerrain({
        source: TERRAIN_SOURCE_ID,
        exaggeration: TERRAIN_EXAGGERATION,
      });
      setIsTerrainEnabled(true);
    }
  }, [libreMap]);

  return { isTerrainEnabled, toggleTerrain };
};

export default useLibreTerrain;
