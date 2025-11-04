/**
 * WebMapTileServiceImageryProvider with json config support
 */
import { WebMapTileServiceImageryProvider } from "cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./Rectangle";
import { UnsupportedProviderOptions } from "./types";

export { WebMapTileServiceImageryProvider };

/**
 * Serializable config that accepts rectangle as BBox in degrees
 * for easier user configuration outside Cesium
 **/
export type WebMapTileServiceProviderConstructorOptionsJson = Omit<
  WebMapTileServiceImageryProvider.ConstructorOptions,
  UnsupportedProviderOptions
> & {
  rectangle?: BBox;
};

export const webMapTileServiceProviderConstructorOptionsFromJson = (
  options: WebMapTileServiceProviderConstructorOptionsJson
): WebMapTileServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: WebMapTileServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
