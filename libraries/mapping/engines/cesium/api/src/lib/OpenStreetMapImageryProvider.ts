/**
 * OpenStreetMapImageryProvider with json config support
 */
import { OpenStreetMapImageryProvider } from "cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./Rectangle";

export { OpenStreetMapImageryProvider };

/**
 * Serializable config that accepts rectangle as BBox in degrees
 * for easier user configuration outside Cesium
 */
export type OpenStreetMapImageryProviderConstructorOptionsJson = Omit<
  OpenStreetMapImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const openStreetMapImageryProviderConstructorOptionsFromJson = (
  options: OpenStreetMapImageryProviderConstructorOptionsJson
): OpenStreetMapImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: OpenStreetMapImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
