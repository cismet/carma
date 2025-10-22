import type { SingleTileImageryProvider } from "cesium";
import type { RectanglePrimitive } from "./Rectangle";

/**
 * SingleTile imagery provider options with primitive rectangle
 * @remarks Extends Cesium options with primitive rectangle bounds
 */
export type SingleTileImageryProviderConstructorOptionsPrimitive = Omit<
  SingleTileImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: RectanglePrimitive;
};
