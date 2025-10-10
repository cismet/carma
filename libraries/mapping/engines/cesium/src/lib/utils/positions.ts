import { Camera, Cartesian3, Cartographic, HeadingPitchRange } from "cesium";

import { type WithElevationProvidersCallback } from "../hooks/useValidInstances";
import { guardSampleTerrainMostDetailedAsync } from "./guardSampleTerrainMostDetailedAsync";

export const distanceFromZoomLevel = (zoom: number) => {
  return 40000000 / Math.pow(2, zoom);
};

export const getHeadingPitchRangeFromZoom = (
  zoom: number,
  {
    heading = 0,
    pitch = Math.PI / 2,
  }: { heading?: number; pitch?: number } = {} // prior
) => {
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
  withElevationProviders: WithElevationProvidersCallback,
  position: Cartographic,
  useClampedHeight: boolean = false
): Promise<Cartographic | null> => {
  let result: Cartographic | null = null;
  await withElevationProviders(
    async (_terrainProvider, surfaceProvider, scene) => {
      // Convert the Cartographic position to Cartesian3 coordinates
      const cartesianPosition = Cartographic.toCartesian(position);

      let updatedPosition: Cartographic | null = null;

      if (useClampedHeight && scene.clampToHeightSupported) {
        let clampedPosition: Cartesian3 | undefined;
        // Attempt to clamp the position to the tileset's height
        try {
          clampedPosition = await scene.clampToHeight(
            cartesianPosition.clone()
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
        result = updatedPosition;
        return;
      } else {
        // Fall back to using terrain data
        console.debug("[CESIUM|TERRAIN] Using surface for position", position);

        try {
          const [surfacePosition] = await guardSampleTerrainMostDetailedAsync(
            surfaceProvider,
            [position]
          );

          if (surfacePosition instanceof Cartographic) {
            console.debug(
              "[CESIUM|TERRAIN] Sampled surface for position",
              position,
              surfacePosition
            );
            result = surfacePosition;
            return;
          } else {
            console.warn(
              "[CESIUM|TERRAIN] Could not get surface elevation for position",
              position,
              surfacePosition
            );
            return;
          }
        } catch (error) {
          console.error("[CESIUM|TERRAIN] Error sampling terrain:", error);
          return;
        }
      }
    }
  );
  return result;
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
