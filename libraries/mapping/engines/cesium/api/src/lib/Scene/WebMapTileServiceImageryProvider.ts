/**
 * WebMapTileServiceImageryProvider with extended config support
 */
import { WebMapTileServiceImageryProvider, Rectangle } from "cesium";
import type { Degrees } from "@carma/units/types";

export { WebMapTileServiceImageryProvider };
export { rectangleFromConfig } from "../Core/Rectangle";

/**
 * Rectangle bounds as plain object with coordinates in DEGREES.
 * @see https://cesium.com/learn/cesiumjs/ref-doc/Rectangle.html#.fromDegrees
 */
export interface RectangleLiteral {
  /** Western longitude in DEGREES */
  west: Degrees;
  /** Southern latitude in DEGREES */
  south: Degrees;
  /** Eastern longitude in DEGREES */
  east: Degrees;
  /** Northern latitude in DEGREES */
  north: Degrees;
}

/**
 * Extended config that accepts rectangle as primitive object
 */
export interface WebMapTileServiceProviderConfigLike {
  url: string;
  layer: string;
  style: string;
  format?: string;
  tileMatrixSetID?: string;
  maximumLevel?: number;
  minimumLevel?: number;
  tileWidth?: number;
  tileHeight?: number;
  tilingScheme?: any;
  /**
   * Rectangle bounds for the imagery layer.
   * Can be a Cesium Rectangle instance or a RectangleLiteral with coordinates in DEGREES.
   */
  rectangle?: Rectangle | RectangleLiteral;
  subdomains?: string | string[];
  credit?: string;
}
