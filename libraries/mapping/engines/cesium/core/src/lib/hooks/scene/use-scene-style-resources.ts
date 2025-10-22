import { useMemo } from "react";
import type {
  CesiumConfig,
  TilesetConfig,
  CesiumTerrainProviderConfig,
  ImageryProviderConfig,
} from "@carma/cesium/types";

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
