import {
  Cartographic,
  type CesiumTerrainProvider,
  isValidCesiumTerrainProvider,
  sampleTerrainMostDetailedGuardedAsync,
} from "@carma/cesium";
import { ElevationReference } from "./elevation-reference";

// TODO move to @carma/cesium/core in next iterations ;

export async function applyElevationToPosition(
  terrainProviders: {
    [ElevationReference.SURFACE]?: CesiumTerrainProvider;
    [ElevationReference.TERRAIN]?: CesiumTerrainProvider;
  },
  position: Cartographic,
  preferredReference: ElevationReference,
  fallbackHeight: number
): Promise<Cartographic> {
  // first assume optimal case
  // TODO define error handling later, all non-preferred cases should be treated as errors that get caught with a fallback height

  const fallbackPosition = position.clone();
  fallbackPosition.height = fallbackHeight;

  const hasPreferredProvider = isValidCesiumTerrainProvider(
    terrainProviders[preferredReference]
  );

  console.log("[CESIUM|TRANSITION] applyElevationToPosition called:", {
    preferredReference,
    hasPreferredProvider,
    fallbackHeight,
    positionLat: ((position.latitude * 180) / Math.PI).toFixed(6),
    positionLon: ((position.longitude * 180) / Math.PI).toFixed(6),
  });

  if (hasPreferredProvider) {
    const provider = terrainProviders[preferredReference]!;

    const updatedPosition = await sampleTerrainMostDetailedGuardedAsync(
      provider,
      [position],
      true,
      true
    )
      .then((results) => {
        console.log("[CESIUM|TRANSITION] Terrain sampling results:", {
          hasResults: !!results,
          resultCount: results?.length,
          firstResult: results?.[0],
          height: results?.[0]?.height,
        });
        return results[0];
      })
      .catch((error) => {
        console.error("[CESIUM|TRANSITION] Terrain sampling failed:", error);
        return undefined;
      });

    if (updatedPosition !== undefined && updatedPosition.height !== undefined) {
      console.log(
        "[CESIUM|TRANSITION] Terrain elevation successfully applied:",
        updatedPosition.height.toFixed(2),
        "m"
      );
      return updatedPosition;
    } else {
      console.warn(
        "[CESIUM|TRANSITION] Terrain sampling returned undefined or no height"
      );
    }
  } else {
    console.warn(
      "[CESIUM|TRANSITION] No valid preferred terrain provider available"
    );
  }

  console.error(
    `[CESIUM|ELEVATION] Failed to apply elevation using preferred reference: ${preferredReference}, applying fallback height: ${fallbackHeight}m`
  );
  return fallbackPosition;
}
