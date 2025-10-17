import type { ImageryLayer, ImageryResourceConfig } from "cesium";

/**
 * Full imagery provider configuration
 * Abstracts away the specific Cesium provider type
 */

/**
 * Imagery layer configuration for use in scene styles
 * Combines provider config with layer-specific display options
 */
export type ImageryProviderConfig = ImageryResourceConfig & {
  id: string;
};

export type ImageryLayerConfig = ImageryProviderConfig & {
  options: ImageryLayer.ConstructorOptions;
};
