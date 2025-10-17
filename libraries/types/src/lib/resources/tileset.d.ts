import type { ContentType, SurfaceModelType, CityModelType } from "./content";
import type { Metadata } from "./metadata";
import { CustomShaderOptions } from "@carma-mapping/engines/cesium/shaders";
/**
 * Minimal type for custom shader options to avoid circular dependency
 * Full type is CustomShaderConstructorOptions from @carma-mapping/engines/cesium/shaders
 */

/**
 * Pure resource definition - just the URL and descriptive properties
 * Multiple configs can reference the same resource with different settings
 */

/**
 * Cesium 3D Tiles content formats (what the tileset actually contains)
 * Based on: https://github.com/CesiumGS/3d-tiles/tree/main/specification
 */
export const TilesetFormats = {
  B3DM: "b3dm", // Batched 3D Model (buildings, bridges, terrain meshes)
  I3DM: "i3dm", // Instanced 3D Model (trees, street lights, repeated objects)
  PNTS: "pnts", // Point Cloud
  CMPT: "cmpt", // Composite (combines multiple formats)
  GLTF: "gltf", // glTF content (Cesium 1.104+)
} as const;

export type TilesetFormat =
  (typeof TilesetFormats)[keyof typeof TilesetFormats];

/**
 * High-level content type classification
 * Determines selectability and interaction behavior
 */
export const TilesetContentTypes = {
  MESH: "mesh", // Monolithic textured mesh (photogrammetry, not feature-selectable)
  OBJECT: "object", // Individual selectable features with properties (batched or instanced)
} as const;

export type TilesetContentType =
  (typeof TilesetContentTypes)[keyof typeof TilesetContentTypes];

/**
 * Tileset type classification for loading strategy
 */
export const TilesetTypes = {
  MESH: "mesh",
  LOD2: "lod2",
} as const;

export type TilesetType = (typeof TilesetTypes)[keyof typeof TilesetTypes];

export type TilesetRenderPreset = {
  customShader?: CustomShaderOptions;
  unlit?: boolean;
};

export type TilesetContentDescription = {
  format?: TilesetFormat; // Cesium content format (b3dm, i3dm, etc.)
  idProperties?: Record<string, string>; // Map readable name to property name, e.g., { "buildings": "OBJECTID", "bridges": "FID" }
  contentType?: TilesetContentType; // classification (mesh vs object)
  surfaceType?: SurfaceModelType; // For terrain/surface models
  cityModelType?: CityModelType; // CityGML LOD level
  contentTypes?: ContentType[]; // Trees etc
};

export type TilesetResourceConfig = {
  url: string;
  metadata?: Metadata;
  content?: TilesetContentDescription;
  renderPreset?: TilesetRenderPreset;
};
