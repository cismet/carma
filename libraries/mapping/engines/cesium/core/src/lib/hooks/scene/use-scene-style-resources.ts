import { useMemo } from "react";
import type { CesiumConfig } from "../../types/config";
import type { TilesetConfig } from "../../types/config/tileset";
import type { CesiumTerrainProviderConfig } from "../../types/config/terrain";
import type { ImageryProviderConfig } from "../../types/config/imagery";

/**
 * Extracts ALL resource sources from scene style.
 * 
 * This is a pure resource extractor - it collects all available sources.
 * Resource initialization and activation happens in the individual managers.
 */
export const useSceneStyleResources = (config: CesiumConfig) => {
  return useMemo(() => {
    const sceneStyle = config.sceneStyle;
    if (!sceneStyle) {
      return { tilesets: [], terrain: [], imagery: [] };
    }
    
    return { 
      tilesets: sceneStyle.sources?.tilesets || [],
      terrain: sceneStyle.sources?.terrain || [],
      imagery: sceneStyle.sources?.imagery || [],
    };
  }, [config]);
};
