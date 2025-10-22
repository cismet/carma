import type { OpenStreetMapImageryProvider } from "cesium";
import type { RectanglePrimitive } from "./Rectangle";

/**
 * OpenStreetMap imagery provider options with primitive rectangle
 * @remarks Extends Cesium options with primitive rectangle bounds
 */
export type OpenStreetMapImageryProviderConstructorOptionsPrimitive = Omit<
  OpenStreetMapImageryProvider.ConstructorOptions,
  "rectangle"
> & {
  rectangle?: RectanglePrimitive;
};
