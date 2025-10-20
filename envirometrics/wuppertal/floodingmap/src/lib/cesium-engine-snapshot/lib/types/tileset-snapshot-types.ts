/**
 * Tileset Types - Snapshot Version
 *
 * These types were used in the old Cesium engine architecture (pre-refactor).
 * They are frozen here for the snapshot and should NOT be used in new code.
 *
 * The current @carma/types package uses a different structure with:
 * - TilesetResourceConfig instead of TilesetConfig
 * - TilesetContentTypes instead of TilesetTypes
 * - More detailed metadata and configuration options
 *
 * DO NOT MODIFY - This is a historical snapshot for compatibility only.
 */

import type { Cesium3DTileset } from "cesium";

/**
 * Old tileset type enum
 * @deprecated Use TilesetContentTypes from current @carma/types instead
 */
export const TilesetTypes = {
  MESH: "MESH",
  LOD2: "LOD2",
} as const;

export type TilesetType = (typeof TilesetTypes)[keyof typeof TilesetTypes];

/**
 * Old custom shader options
 * @deprecated Use CustomShaderOptions from @carma-mapping/engines/cesium/shaders instead
 */
export type CesiumCustomShaderOptions = {
  mode?: any; // CustomShaderMode enum
  lightingModel?: any; // LightingModel enum
  translucencyMode?: any; // CustomShaderTranslucencyMode enum
  uniforms?: Record<string, any>;
  varyings?: Record<string, any>;
  vertexShaderText?: string;
  fragmentShaderText?: string;
};

/**
 * Old tileset configuration structure
 * @deprecated Use TilesetResourceConfig from current @carma/types instead
 */
export type TilesetConfig = {
  url: string;
  type: TilesetType;
  translation?: { x: number; y: number; z: number };
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
};
