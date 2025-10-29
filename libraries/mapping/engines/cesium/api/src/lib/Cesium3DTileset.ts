import { Cesium3DTileset } from "cesium";
export { Cesium3DTileset };

export const isValidTileset = (
  tileset: unknown
): tileset is Cesium3DTileset => {
  return tileset instanceof Cesium3DTileset && tileset.isDestroyed() === false;
};

/**
 * Guard helper for Cesium3DTileset
 */
export const guardTileset = (tileset: Cesium3DTileset, label?: string) => {
  if (!isValidTileset(tileset)) {
    throw new Error(`Invalid Cesium3DTileset${label ? ` (${label})` : ""}`);
  }
};

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
  dynamicScreenSpaceError?: boolean;
  dynamicScreenSpaceErrorDensity?: number;
  dynamicScreenSpaceErrorFactor?: number;
  dynamicScreenSpaceErrorHeightFalloff?: number;
  debugShowMemoryUsage?: boolean;
  debugShowUrl?: boolean;
};
