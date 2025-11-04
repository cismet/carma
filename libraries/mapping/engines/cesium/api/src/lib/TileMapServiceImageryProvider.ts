/**
 * TileMapServiceImageryProvider with json config support
 */
import { TileMapServiceImageryProvider } from "cesium";
import type { BBox } from "@carma/geo/types";
import { rectangleFromBBox } from "./Rectangle";

export { TileMapServiceImageryProvider };

/**
 * Serializable config that accepts rectangle as BBox in degrees
 * for easier user configuration outside Cesium
 */
export type TileMapServiceImageryProviderConstructorOptionsJson = Omit<
  TileMapServiceImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: BBox;
};

export const tileMapServiceImageryProviderConstructorOptionsFromJson = (
  options: TileMapServiceImageryProviderConstructorOptionsJson
): TileMapServiceImageryProvider.ConstructorOptions => {
  const { rectangle, ...rest } = options;
  const cesiumOptions: TileMapServiceImageryProvider.ConstructorOptions = {
    ...rest,
  };
  if (rectangle) {
    cesiumOptions.rectangle = rectangleFromBBox(rectangle);
  }
  return cesiumOptions;
};
