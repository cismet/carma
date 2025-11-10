import { TilesetConfig, TilesetStyle } from "./tileset";
import { ImageryProviderConfig, ImageryLayerConfig } from "./imagery";
import { CesiumTerrainProviderConfig } from "./terrain";
import type { ColorConstructor } from "@carma/cesium/types";
import type { GlobeConstructorOptionsPrimitive } from "@carma/cesium";

export type { ColorConstructor, GlobeConstructorOptionsPrimitive };

/**
 * Scene Style Configuration
 *
 * RESOURCES vs CONFIGS:
 * - Resources (url only) define WHAT to load
 * - Configs (with options) define HOW to load and style
 * - Multiple styles can use same resource URL with different configs
 * - If configs match (URL + options), we reuse the same Cesium tileset instance
 */

export type SceneStyle = {
  id: string;
  name?: string;
  shadows?: boolean; // Per-style shadow control (default: false)
  backgroundColor?: ColorConstructor;
  globe?: GlobeConstructorOptionsPrimitive;
  imageryLayers?: Array<ImageryLayerConfig>;
  tilesets?: Array<TilesetStyle>;
  terrain?: CesiumTerrainProviderConfig.id;
};

/**
 * Scene style sources - declare available resources
 * Resources are just URLs + metadata, configs define loading behavior
 */
type SceneStyleConfigSources = {
  imagery?: ImageryProviderConfig[];
  terrain?: CesiumTerrainProviderConfig[];
  tilesets?: TilesetConfig[]; //
  // models?: ModelConfig[]; // TODO: Future - custom models per style
};

export type SceneStyleConfig = {
  // SOURCES: Declare available resources with required IDs
  sources?: SceneStyleConfigSources;
  // STYLES: Array of visual style variants that use these sources
  styles?: Array<SceneStyle>;
};
