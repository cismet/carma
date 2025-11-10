import {
  Camera,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  HeadingPitchRange,
  Scene,
} from "cesium";

import { logOnce } from "@carma-commons/utils";
import { getSurfaceElevationAsync } from "./elevation";

/**
 * @deprecated Legacy zoom-to-distance conversion with incorrect formula.
 * Use proper geographic calculations from @carma-mapping/engines-interop instead.
 * Will be replaced in future commit with correct conversion based on FOV and viewport dimensions.
 */
export const distanceFromZoomLevel = (zoom: number) => {
  logOnce(
    "[DEPRECATED] distanceFromZoomLevel uses incorrect formula (40000000 / 2^zoom) - will be replaced with proper conversion"
  );
  return 40000000 / Math.pow(2, zoom);
};

/**
 * @deprecated Legacy function using incorrect distanceFromZoomLevel.
 * Use proper geographic calculations from @carma-mapping/engines-interop instead.
 */
export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  {
    heading = 0,
    pitch = Math.PI / 2,
  }: { heading?: number; pitch?: number } = {} // prior
) => {
  logOnce(
    "[DEPRECATED] getHeadingPitchRangeFromZoom relies on incorrect distanceFromZoomLevel - will be replaced"
  );
  const range = distanceFromZoomLevel(zoom);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getHeadingPitchRangeFromHeight = (
  { positionCartographic, heading, pitch }: Camera,
  targetPosition: Cartographic
) => {
  const cameraHeight = positionCartographic.height;
  const targetHeight = targetPosition.height;
  const heightDifference = cameraHeight - targetHeight;

  const range = heightDifference / Math.cos(pitch);
  //console.log("getHPR from Height", Math.round(cameraHeight),Math.round(targetHeight),Math.round(heightDifference),Math.round(range), Math.cos(pitch),);
  return new HeadingPitchRange(heading, pitch, range);
};

export const getPositionWithHeightAsync = async (
  scene: Scene,
  surfaceProvider: CesiumTerrainProvider,
  position: Cartographic,
  useClampedHeight: boolean = false
) => {
  // Convert the Cartographic position to Cartesian3 coordinates
  const cartesianPosition = Cartographic.toCartesian(position);

  let updatedPosition: Cartographic | null = null;

  if (useClampedHeight) {
    let clampedPosition: Cartesian3 | undefined;
    // Attempt to clamp the position to the tileset's height
    try {
      clampedPosition = scene.clampToHeight(
        cartesianPosition
        //[tileset],
      );

      if (clampedPosition) {
        const clampedCartesian = clampedPosition;
        const clampedCartographic =
          Cartographic.fromCartesian(clampedCartesian);

        updatedPosition = new Cartographic(
          position.longitude,
          position.latitude,
          clampedCartographic.height
        );

        console.debug(
          "[CESIUM|TILESET] Clamped position found for position",
          position,
          updatedPosition
        );
      } else {
        console.warn(
          "[CESIUM|TILESET] No clamped position found for position",
          position
        );
      }
    } catch (error) {
      console.error(
        "[CESIUM|TILESET] Error clamping to tileset height:",
        error
      );
    }
  } else {
    console.debug("[CESIUM|TILESET] No Tileset provided, using terrain");
  }

  if (updatedPosition) {
    // Elevation obtained from the tileset
    return updatedPosition;
  } else {
    // Fall back to using terrain data
    console.debug("[CESIUM|TERRAIN] Using surface for position", position);

    try {
      const [surfacePosition] = await getSurfaceElevationAsync(
        surfaceProvider,
        [position]
      );

      if (surfacePosition instanceof Cartographic) {
        console.debug(
          "[CESIUM|TERRAIN] Sampled surface for position",
          position,
          surfacePosition
        );
        return surfacePosition;
      } else {
        console.warn(
          "[CESIUM|TERRAIN] Could not get surface elevation for position",
          position,
          surfacePosition
        );
        return position;
      }
    } catch (error) {
      console.error("[CESIUM|TERRAIN] Error sampling terrain:", error);
      return position;
    }
  }
};

export const validateWorldCoordinate = (
  testPosition: Cartesian3 | Camera,
  center: Cartesian3,
  range: number = 50000,
  minHeight: number = 0
): boolean => {
  const wc =
    testPosition instanceof Camera ? testPosition.positionWC : testPosition;
  return (
    Cartesian3.distance(wc, center) <= range &&
    Cartographic.fromCartesian(wc).height >= minHeight
  );
};
