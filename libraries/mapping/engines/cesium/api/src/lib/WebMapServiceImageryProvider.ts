/**
 * WebMapServiceImageryProvider with json config support
 */
import { WebMapServiceImageryProvider } from "cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./Rectangle";
import { UnsupportedProviderOptions } from "./types";

export { WebMapServiceImageryProvider };

/**
 * Serializable config that accepts rectangle as BBox in degrees
 * for easier user configuration outside Cesium
 */
export type WebMapServiceImageryProviderConstructorOptionsJson = Omit<
  WebMapServiceImageryProvider.ConstructorOptions,
  UnsupportedProviderOptions
> & {
  rectangle?: BBox;
};

export const webMapServiceImageryProviderConstructorOptionsFromJson = (
  options: WebMapServiceImageryProviderConstructorOptionsJson
): WebMapServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: WebMapServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
