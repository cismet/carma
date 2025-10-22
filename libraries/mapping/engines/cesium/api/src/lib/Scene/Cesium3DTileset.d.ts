import type { Cartesian3Primitive } from "../Core/Cartesian3";

/**
 * 3D Tileset constructor options with primitive values
 * @remarks Options passed during tileset construction
 */
export type Cesium3DTilesetConstructorOptionsPrimitive = {
  url?: string;
  show?: boolean;
  matrix?: any; // Matrix4
  maximumScreenSpaceError?: number;
  maximumMemoryUsage?: number;
  cullWithChildrenBounds?: boolean;
  cullRequestsWhileMoving?: boolean;
  cullRequestsWhileWaitingForChildren?: boolean;
  preloadWhenHidden?: boolean;
  preloadFlightDestinations?: boolean;
  preferLeaves?: boolean;
  progressiveResolutionHeightFraction?: number;
  foveatedConeSize?: number;
  foveatedMinimumScreenSpaceErrorRelativeToScreen?: number;
  foveatedInterpolationCallback?: any;
  foveatedTimeDelay?: number;
  skipLevelOfDetail?: boolean;
  baseScreenSpaceError?: number;
  skipScreenSpaceErrorFactor?: number;
  skipLevels?: number;
  immediatelyLoadDesiredLevelOfDetail?: boolean;
  loadSiblings?: boolean;
  debugHeatmapTilePropertyName?: string;
  debugFreezeFrame?: boolean;
  debugColorizeTiles?: boolean;
  debugWireframe?: boolean;
  debugShowBoundingVolume?: boolean;
  debugShowContentBoundingVolume?: boolean;
  debugShowViewerRequestVolume?: boolean;
};

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
