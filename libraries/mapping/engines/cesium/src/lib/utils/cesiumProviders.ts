import type {
  WebMapServiceProviderConfig,
  WebMapTileServiceProviderConfig,
} from "@carma-commons/types";
import {
  CesiumTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
} from "cesium";

export interface ProviderConfig {
  surfaceProvider?: {
    url: string;
  };
  terrainProvider: {
    url: string;
  };
  imageryProvider?:
    | WebMapServiceProviderConfig
    | WebMapTileServiceProviderConfig;
}

const nativeTileSize = 128;

export const loadCesiumTerrainProvider = async (
  ref: React.MutableRefObject<CesiumTerrainProvider | null>,
  url: string,
  signal: AbortSignal
) => {
  try {
    const provider = await CesiumTerrainProvider.fromUrl(url);
    if (!signal.aborted) {
      ref.current = provider;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load terrain provider", url, error);
    }
  }
};

export const loadCesiumWebMapServiceImageryLayer = async (
  ref: React.MutableRefObject<ImageryLayer | null>,
  config: WebMapServiceProviderConfig,
  signal: AbortSignal
) => {
  try {
    const imageryProvider = new WebMapServiceImageryProvider(config);
    const newImageryLayer = new ImageryLayer(imageryProvider);
    if (!signal.aborted) {
      ref.current = newImageryLayer;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load imagery provider:", error);
    }
  }
};

const isWebMapServiceConfig = (
  config: WebMapServiceProviderConfig | WebMapTileServiceProviderConfig
): config is WebMapServiceProviderConfig => {
  return "layers" in config && "parameters" in config;
};

const isWebMapTileServiceConfig = (
  config: WebMapServiceProviderConfig | WebMapTileServiceProviderConfig
): config is WebMapTileServiceProviderConfig => {
  return "layer" in config && "style" in config && "tileMatrixSetID" in config;
};

export const loadCesiumWebMapTileServiceImageryLayer = async (
  ref: React.MutableRefObject<ImageryLayer | null>,
  config: WebMapTileServiceProviderConfig,
  signal: AbortSignal
) => {
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
      ref.current = newImageryLayer;
    }
  } catch (error) {
    if (!signal.aborted) {
      console.error("Failed to load WMTS imagery provider:", error);
    }
  }
};

// Generic loader that uses type guards to determine which provider to use
export const loadCesiumImageryLayer = async (
  ref: React.MutableRefObject<ImageryLayer | null>,
  config: WebMapServiceProviderConfig | WebMapTileServiceProviderConfig,
  signal: AbortSignal
) => {
  if (isWebMapServiceConfig(config)) {
    return loadCesiumWebMapServiceImageryLayer(ref, config, signal);
  } else if (isWebMapTileServiceConfig(config)) {
    return loadCesiumWebMapTileServiceImageryLayer(ref, config, signal);
  } else {
    console.error("Unknown imagery provider config type:", config);
  }
};
