import {
  CesiumTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
} from "cesium";

import { createResourceInitSignature } from "./resourceSignatures";

export const DEFAULT_TERRAIN_PROVIDER_ID = "terrain";
export const DEFAULT_SURFACE_PROVIDER_ID = "surface";
export const DEFAULT_IMAGERY_LAYER_ID = "imagery";

export type TerrainProviderConfig = {
  url: string;
};

export type ImageryLayerConfig =
  | WebMapTileServiceImageryProvider.ConstructorOptions
  | WebMapServiceImageryProvider.ConstructorOptions;

export type TerrainProviderConfigs = Record<string, TerrainProviderConfig>;
export type ImageryLayerConfigs = Record<string, ImageryLayerConfig>;

export interface ProviderConfig {
  terrainProvider?: TerrainProviderConfig;
  surfaceProvider?: TerrainProviderConfig;
  terrainProviders?: TerrainProviderConfigs;
  imageryProvider?: ImageryLayerConfig;
  imageryProviders?: ImageryLayerConfigs;
}

const nativeTileSize = 128;

export const normalizeTerrainProviderConfigs = (
  config: ProviderConfig
): TerrainProviderConfigs => ({
  ...(config.terrainProvider
    ? { [DEFAULT_TERRAIN_PROVIDER_ID]: config.terrainProvider }
    : {}),
  ...(config.surfaceProvider
    ? { [DEFAULT_SURFACE_PROVIDER_ID]: config.surfaceProvider }
    : {}),
  ...(config.terrainProviders ?? {}),
});

export const normalizeImageryLayerConfigs = (
  config: ProviderConfig
): ImageryLayerConfigs => ({
  ...(config.imageryProvider
    ? { [DEFAULT_IMAGERY_LAYER_ID]: config.imageryProvider }
    : {}),
  ...(config.imageryProviders ?? {}),
});

export const getTerrainProviderInitSignature = (
  config: TerrainProviderConfig
): string =>
  createResourceInitSignature({
    type: "CesiumTerrainProvider",
    url: config.url,
  });

export const loadCesiumTerrainProvider = async (
  url: string,
  signal: AbortSignal
): Promise<CesiumTerrainProvider | null> => {
  try {
    const provider = await CesiumTerrainProvider.fromUrl(url);
    if (!signal.aborted) {
      return provider;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load terrain provider", url, error);
    }
  }
  return null;
};

export const loadCesiumWebMapServiceImageryLayer = async (
  config: WebMapServiceImageryProvider.ConstructorOptions,
  signal: AbortSignal
): Promise<ImageryLayer | null> => {
  try {
    const imageryProvider = new WebMapServiceImageryProvider(config);
    const newImageryLayer = new ImageryLayer(imageryProvider);
    if (!signal.aborted) {
      return newImageryLayer;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load imagery provider:", error);
    }
  }
  return null;
};

const isWebMapServiceConfig = (
  config:
    | WebMapServiceImageryProvider.ConstructorOptions
    | WebMapTileServiceImageryProvider.ConstructorOptions
): config is WebMapServiceImageryProvider.ConstructorOptions => {
  return "layers" in config && "parameters" in config;
};

const isWebMapTileServiceConfig = (
  config:
    | WebMapServiceImageryProvider.ConstructorOptions
    | WebMapTileServiceImageryProvider.ConstructorOptions
): config is WebMapTileServiceImageryProvider.ConstructorOptions => {
  return "layer" in config && "style" in config && "tileMatrixSetID" in config;
};

export const loadCesiumWebMapTileServiceImageryLayer = async (
  config: WebMapTileServiceImageryProvider.ConstructorOptions,
  signal: AbortSignal
): Promise<ImageryLayer | null> => {
  try {
    const dpr = window.devicePixelRatio ?? 1;
    const renderSize = Math.floor(nativeTileSize / dpr);
    const tileWidth = renderSize;
    const tileHeight = renderSize;

    const options = {
      ...config,
      tileWidth,
      tileHeight,
    };

    console.debug("[CESIUM|WMTS] adding WMTS provider", options);

    const imageryProvider = new WebMapTileServiceImageryProvider(options);

    const newImageryLayer = new ImageryLayer(imageryProvider);
    if (!signal.aborted) {
      return newImageryLayer;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load WMTS imagery provider:", error);
    }
  }
  return null;
};

// Generic loader that uses type guards to determine which provider to use
export const loadCesiumImageryLayer = async (
  config: ImageryLayerConfig,
  signal: AbortSignal
): Promise<ImageryLayer | null> => {
  if (isWebMapServiceConfig(config)) {
    return loadCesiumWebMapServiceImageryLayer(config, signal);
  } else if (isWebMapTileServiceConfig(config)) {
    return loadCesiumWebMapTileServiceImageryLayer(config, signal);
  } else {
    console.error("Unknown imagery provider config type:", config);
  }
  return null;
};
