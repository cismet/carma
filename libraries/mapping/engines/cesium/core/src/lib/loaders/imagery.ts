import {
  ImageryLayer,
  WebMapServiceImageryProvider,
  WebMapTileServiceImageryProvider,
  rectangleFromConfig,
} from "@carma/cesium";
import type { MutableRefObject } from "react";
import type { ImageryProviderConfig } from "@carma/cesium/types";

const nativeTileSize = 128;

export const loadCesiumWebMapServiceImageryLayer = async (
  ref: MutableRefObject<ImageryLayer | null>,
  config: ImageryProviderConfig,
  signal: AbortSignal
) => {
  try {
    // Extract providerOptions from the config wrapper
    const providerOptions = config.providerOptions as any;
    const imageryProvider = new WebMapServiceImageryProvider(providerOptions);
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

export const loadCesiumWebMapTileServiceImageryLayer = async (
  ref: MutableRefObject<ImageryLayer | null>,
  config: ImageryProviderConfig,
  signal: AbortSignal
) => {
  try {
    const dpr = window.devicePixelRatio ?? 1;
    const renderSize = Math.floor(nativeTileSize / dpr);
    const tileWidth = renderSize;
    const tileHeight = renderSize;

    // Extract providerOptions from the config wrapper
    const providerOptions = config.providerOptions as any;

    const options = {
      ...providerOptions,
      tileWidth,
      tileHeight,
      rectangle: rectangleFromConfig(providerOptions.rectangle),
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

export const loadCesiumImageryLayer = async (
  ref: MutableRefObject<ImageryLayer | null>,
  config: ImageryProviderConfig,
  signal: AbortSignal
) => {
  const type = config.type;

  if (type === "wms") {
    return loadCesiumWebMapServiceImageryLayer(ref, config, signal);
  } else if (type === "wmts") {
    return loadCesiumWebMapTileServiceImageryLayer(ref, config, signal);
  } else {
    console.error("Unknown imagery provider config type:", type, config);
  }
};
