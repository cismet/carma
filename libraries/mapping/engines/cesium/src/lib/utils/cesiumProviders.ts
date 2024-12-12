import {
  CesiumTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
} from "cesium";

import type { ImageryProviderConfig } from "../..";

export interface ProviderConfig {
  surfaceProvider?: {
    url: string;
  };
  terrainProvider: {
    url: string;
  };
  imageryProvider?: ImageryProviderConfig;
}

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

export const loadCesiumImageryLayer = async (
  ref: React.MutableRefObject<ImageryLayer | null>,
  config: ImageryProviderConfig,
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
