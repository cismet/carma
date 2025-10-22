import type { TileMapServiceImageryProvider } from "cesium";
import type { RectanglePrimitive } from "./Rectangle";

/**
 * TileMapService imagery provider options with primitive rectangle
 * @remarks Extends Cesium options with primitive rectangle bounds, omits complex objects
 */
export type TileMapServiceImageryProviderConstructorOptionsPrimitive = Omit<
  TileMapServiceImageryProvider.ConstructorOptions,
  "rectangle" | "tilingScheme" | "ellipsoid"
> & {
  rectangle?: RectanglePrimitive;
};
