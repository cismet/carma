import { useMemo } from "react";
import type {
  CesiumConfig,
  TilesetConfig,
  CesiumTerrainProviderConfig,
  ImageryProviderConfig,
} from "@carma/cesium/types";

// Stable empty array references - prevents unnecessary re-renders
const EMPTY_TILESETS: TilesetConfig[] = [];
const EMPTY_TERRAIN: CesiumTerrainProviderConfig[] = [];
const EMPTY_IMAGERY: ImageryProviderConfig[] = [];

/**
 * Extracts ALL resource sources from scene style.
 *
 * Properly memoized to prevent unnecessary re-initialization of resource managers.
 * Uses stable empty array references when sources are missing.
 *
 * This is a pure resource extractor - it collects all available sources.
 * Resource initialization and activation happens in the individual managers.
 */
export const useSceneStyleResources = (config: CesiumConfig) => {
  return useMemo(() => {
    const sceneStyle = config.sceneStyle;
    if (!sceneStyle) {
      return {
        tilesets: EMPTY_TILESETS,
        terrain: EMPTY_TERRAIN,
        imagery: EMPTY_IMAGERY,
      };
    }

    return {
      tilesets: sceneStyle.sources?.tilesets || EMPTY_TILESETS,
      terrain: sceneStyle.sources?.terrain || EMPTY_TERRAIN,
      imagery: sceneStyle.sources?.imagery || EMPTY_IMAGERY,
    };
  }, [config.sceneStyle]); // More specific dependency - only re-memoize if sceneStyle changes
};
