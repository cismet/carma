import { Cesium3DTileset, CustomShader, ShadowMode } from "cesium";

import { TilesetConfig, TilesetType } from "@carma-commons/resources";

import { CUSTOM_SHADERS_DEFINITIONS, CustomShaderKeys } from "../shaders";

export type TilesetConfigs = {
  primary: TilesetConfig;
  secondary?: TilesetConfig;
};

const DEFAULT_MESH_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  preloadWhenHidden: false,
  shadows: ShadowMode.DISABLED,
  enableCollision: false,

  maximumScreenSpaceError: 6, // target 100% quality
  // TODO expose this via UI 2 is like 3x the data of 6
  // HQ 4 or higher
  // LQ 16 or worse

  //dynamicScreenSpaceError: true, // only needed for low angle views

  // not sure if this is even doing anything
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.25,
  foveatedMinimumScreenSpaceErrorRelaxation: 32,

  skipLevelOfDetail: true,
  skipScreenSpaceErrorFactor: 128,
  baseScreenSpaceError: 4096, // minimum quality to load before skipping
  //loadSiblings: true, // with SkipLevelOfDetail not useful for intial load speed
  //immediatelyLoadDesiredLevelOfDetail: true,
};

const DEFAULT_LOD2_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  maximumScreenSpaceError: 4,
  dynamicScreenSpaceError: false,
  foveatedScreenSpaceError: true,
  preloadWhenHidden: false, // only set this to true sometime after initial load
  enableCollision: false,
};

const loadLOD2Tileset = async (tileset: TilesetConfig) => {
  const lod2Options = {
    ...tileset.constructorOptions,
    ...DEFAULT_LOD2_OPTIONS,
  };
  const lod2 = await Cesium3DTileset.fromUrl(tileset.url, lod2Options);
  return lod2;
};

const loadMeshTileset = async (tileset: TilesetConfig) => {
  // TODO get shader from tileset config
  const shader = new CustomShader(
    CUSTOM_SHADERS_DEFINITIONS[CustomShaderKeys.UNLIT_ENHANCED_2024]
  );
  const meshOptions = {
    ...tileset.constructorOptions,
    ...DEFAULT_MESH_OPTIONS,
  };
  const mesh = await Cesium3DTileset.fromUrl(tileset.url, meshOptions);
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
