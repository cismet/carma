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

import type { Cesium3DTileset, Model, Matrix4, Polyline } from "cesium";

/**
 * Old tileset type enum
 * @deprecated Use TilesetContentTypes from current @carma/types instead
 */
export const TilesetTypes = {
  MESH: "MESH",
  LOD2: "LOD2",
} as const;

export type TilesetType = (typeof TilesetTypes)[keyof typeof TilesetTypes];

export type PolylineConfig = {
  color?: [number, number, number, number];
  width?: number;
  gap?: number;
  glow?: boolean;
};

/**
 * Old marker/model asset types
 * @deprecated Use types from @carma-mapping/engines/cesium/selection-marker instead
 */
export type MarkerModelAsset = {
  uri: string;
  scale?: number;
  isCameraFacing?: boolean;
  rotation?: boolean | number;
  fixedScale?: boolean;
  anchorOffset?: { x?: number; y?: number; z?: number };
  hasAnimation?: boolean;
  stemline?: Partial<PolylineConfig>;
};

export type ParsedMarkerModelAsset = {
  isParsed: true;
  uri: string;
  scale: number;
  isCameraFacing: boolean;
  rotation: boolean | number;
  fixedScale: boolean;
  anchorOffset: { x: number; y: number; z: number };
  hasAnimation: boolean;
  model: Model;
};

/**
 * Old custom shader options
 * @deprecated Use CustomShaderOptions from @carma-mapping/engines/cesium/shaders instead
 *
 * Note: This matches the actual Cesium CustomShader constructor signature
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
  constructorOptions?: Cesium3DTileset.ConstructorOptions;
  translation?: { x: number; y: number; z: number };
};
