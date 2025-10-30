import { Cartographic } from "cesium";
import type { CesiumContextType } from "../../CesiumContext";
import { getElevationAsync } from "../elevation";
import { ElevationReference } from "./elevationReference";

/**
 * Applies elevation data to a cartographic position.
 * Tries to get accurate terrain/surface elevation but doesn't block if unavailable.
 *
 * @param ctx - The Cesium context
 * @param position - The cartographic position to update with elevation
 * @param preferredReference - Whether to prefer SURFACE or TERRAIN elevation
 * @param fallbackHeight - Height to use if elevation data unavailable
 * @returns The position with updated height
 */
export async function applyElevationToPosition(
  ctx: CesiumContextType,
  position: Cartographic,
  preferredReference: ElevationReference,
  fallbackHeight: number
): Promise<Cartographic> {
  // Try to get accurate elevation, but don't block transition if it fails
  const [elevation] = await getElevationAsync(ctx, [position]);

  if (elevation) {
    const { terrain, surface } = elevation;

    if (
      preferredReference === ElevationReference.TERRAIN &&
      terrain?.height !== undefined
    ) {
      position.height = terrain.height;
      console.debug(
        "[CESIUM|TRANSITION] terrain height applied",
        terrain.height
      );
    } else if (
      preferredReference === ElevationReference.SURFACE &&
      surface?.height !== undefined
    ) {
      position.height = surface.height;
      console.debug(
        "[CESIUM|TRANSITION] surface height applied",
        surface.height
      );
    } else {
      position.height = surface?.height ?? terrain?.height ?? fallbackHeight;
      console.debug(
        "[CESIUM|TRANSITION] best available height applied",
        position.height,
        surface?.height,
        terrain?.height,
        fallbackHeight
      );
    }
  } else {
    position.height = fallbackHeight;
    console.debug(
      "[CESIUM|TRANSITION] using fallback height (elevation unavailable)",
      fallbackHeight
    );
  }

  return position;
}
