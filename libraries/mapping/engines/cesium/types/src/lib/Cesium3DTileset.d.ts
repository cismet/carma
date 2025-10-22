import type { Cartesian3Primitive } from "./Cartesian3";

/**
 * 3D Tileset style options with primitive values
 * @remarks Mutable properties that can be changed after tileset construction
 */
export type Cesium3DTilesetStyleOptionsPrimitive = {
  opacity?: number;
  shadows?: number;
  show?: boolean;
  colorBlendMode?: number;
  maximumScreenSpaceError?: number;
  backFaceCulling?: boolean;
  lightColor?: Cartesian3Primitive;
};
