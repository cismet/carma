import { Cesium3DTileset, ShadowMode } from "cesium";

import { TilesetConfig, TilesetType } from "@carma-commons/resources";

import { createResourceInitSignature } from "./resourceSignatures";

export type TilesetConfigs = {
  [id: string]: TilesetConfig;
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

export const getEffectiveTilesetConstructorOptions = (
  tileset: TilesetConfig
): Cesium3DTileset.ConstructorOptions => {
  if (tileset.type === TilesetType.LOD2) {
    return {
      ...tileset.constructorOptions,
      ...DEFAULT_LOD2_OPTIONS,
    };
  }

  if (tileset.type === TilesetType.MESH) {
    return {
      ...tileset.constructorOptions,
      ...DEFAULT_MESH_OPTIONS,
    };
  }

  throw new Error(`Unknown tileset type: ${tileset.type}`);
};

export const getTilesetInitSignature = (tileset: TilesetConfig): string =>
  createResourceInitSignature({
    type: tileset.type,
    url: tileset.url,
    constructorOptions: getEffectiveTilesetConstructorOptions(tileset),
  });

export const loadTileset = async (tileset: TilesetConfig) => {
  return await Cesium3DTileset.fromUrl(
    tileset.url,
    getEffectiveTilesetConstructorOptions(tileset)
  );
};
