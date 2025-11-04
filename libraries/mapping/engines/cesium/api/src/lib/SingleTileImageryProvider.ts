/**
 * SingleTileImageryProvider with json config support
 */
import { SingleTileImageryProvider } from "cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./Rectangle";

export { SingleTileImageryProvider };

/**
 * Serializable config that accepts rectangle as BBox in degrees
 * for easier user configuration outside Cesium
 */
export type SingleTileImageryProviderConstructorOptionsJson = Omit<
  SingleTileImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const singleTileImageryProviderConstructorOptionsFromJson = (
  options: SingleTileImageryProviderConstructorOptionsJson
): SingleTileImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: SingleTileImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
