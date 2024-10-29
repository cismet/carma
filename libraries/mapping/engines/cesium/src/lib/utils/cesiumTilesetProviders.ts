import { Cesium3DTileset, CustomShader, ShadowMode } from "cesium";

import { TilesetConfig, TilesetType } from "@carma-commons/resources";

import { CUSTOM_SHADERS_DEFINITIONS, CustomShaderKeys } from "../shaders";

export type TilesetConfigs = {
  primary: TilesetConfig;
  secondary: TilesetConfig;
};

const DEFAULT_MESH_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  baseScreenSpaceError: 64,
  maximumScreenSpaceError: 6,
  dynamicScreenSpaceError: false, // only needed for low angle views
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.2,
  foveatedMinimumScreenSpaceErrorRelaxation: 2,
  preloadWhenHidden: false,
  shadows: ShadowMode.DISABLED,
  skipLevelOfDetail: true,
  skipScreenSpaceErrorFactor: 4,
  loadSiblings: true, // with SkipLevelOfDetail
  //immediatelyLoadDesiredLevelOfDetail: true,

  enableCollision: false,
};

const DEFAULT_LOD2_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  maximumScreenSpaceError: 4,
  dynamicScreenSpaceError: false,
  foveatedScreenSpaceError: true,
  preloadWhenHidden: false, // only set this to true sometime after initial load
  enableCollision: false,
};

const loadLOD2Tileset = async (tileset: TilesetConfig) => {
  const lod2 = await Cesium3DTileset.fromUrl(tileset.url, {
    ...tileset.constructorOptions,
    ...DEFAULT_LOD2_OPTIONS,
  });
  return lod2;
};

const loadMeshTileset = async (tileset: TilesetConfig) => {
  // TODO get shader from tileset config
  const shader = new CustomShader(
    CUSTOM_SHADERS_DEFINITIONS[CustomShaderKeys.UNLIT_ENHANCED_2024]
  );
  const mesh = await Cesium3DTileset.fromUrl(tileset.url, {
    ...tileset.constructorOptions,
    ...DEFAULT_MESH_OPTIONS,
  });
  mesh.customShader = shader;
  return mesh;
};

export const loadTileset = async (tileset: TilesetConfig) => {
  if (tileset.type === TilesetType.LOD2) {
    return await loadLOD2Tileset(tileset);
  } else if (tileset.type === TilesetType.MESH) {
    return await loadMeshTileset(tileset);
  } else {
    throw new Error(`Unknown tileset type: ${tileset.type}`);
  }
};
