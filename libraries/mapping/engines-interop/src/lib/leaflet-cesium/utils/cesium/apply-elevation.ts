import {
  Cartographic,
  type CesiumTerrainProvider,
  type Scene,
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

  if (hasPreferredProvider) {
    const provider = terrainProviders[preferredReference]!;
    const updatedPosition = await sampleTerrainMostDetailedGuardedAsync(
      provider,
      [position],
      true,
      true
    ).then((results) => results[0]);
    if (updatedPosition !== undefined) {
      return updatedPosition;
    }
  }

  console.error(
    `[CESIUM|ELEVATION] Failed to apply elevation using preferred reference: ${preferredReference}, applying fallback height.`
  );
  return fallbackPosition;
}
