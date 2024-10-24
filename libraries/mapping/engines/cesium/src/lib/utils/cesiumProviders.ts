import {
  CesiumTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
} from "cesium";
import { ImageryProviderConfig } from "../..";

export interface ProviderConfig {
  surfaceProvider?: {
    url: string;
  };
  terrainProvider: {
    url: string;
  };
  imageryProvider: ImageryProviderConfig;
}

export const loadCesiumTerrainProvider = async (
  ref: React.MutableRefObject<CesiumTerrainProvider | null>,
  url: string,
  isMounted: boolean
) => {
  try {
    const provider = await CesiumTerrainProvider.fromUrl(url);
    if (isMounted) {
      ref.current = provider;
    }
  } catch (error) {
    console.error("Failed to load terrain provider", url, error);
  }
};

export const loadCesiumImageryLayer = async (
  ref: React.MutableRefObject<ImageryLayer | null>,
  config: ImageryProviderConfig,
  isMounted: boolean
) => {
  try {
    const imageryProvider = new WebMapServiceImageryProvider(config);
    const newImageryLayer = new ImageryLayer(imageryProvider);
    if (isMounted) {
      ref.current = newImageryLayer;
    }
  } catch (error) {
    console.error("Failed to load imagery provider:", error);
  }
};
