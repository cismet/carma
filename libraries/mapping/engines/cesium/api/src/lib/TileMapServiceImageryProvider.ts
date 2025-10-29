import { TileMapServiceImageryProvider } from "cesium";

export { TileMapServiceImageryProvider };

import { RectanglePrimitive } from "./Rectangle";
import { EllipsoidPrimitive } from "./Ellipsoid";

/**
 * Primitive constructor options for TileMapServiceImageryProvider
 */
export type TileMapServiceImageryProviderConstructorOptionsPrimitive = {
  url: string;
  fileExtension?: string;
  rectangle?: RectanglePrimitive;
  minimumLevel?: number;
  maximumLevel?: number;
  ellipsoid?: EllipsoidPrimitive;
};
