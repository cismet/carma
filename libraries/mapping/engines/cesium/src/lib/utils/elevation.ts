import { Cartographic, CesiumTerrainProvider } from "cesium";
import { guardSampleTerrainMostDetailedAsync } from "./guardSampleTerrainMostDetailedAsync";

export type ElevationResult = {
  terrain: Cartographic;
  surface?: Cartographic;
  position: Cartographic; // return original position for convenience
};

/**
 * Prefer surface/mesh elevation when available, otherwise fall back to terrain.
 */
export async function getElevationAsync(
  surfaceProvider: CesiumTerrainProvider,
  terrainProvider: CesiumTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true
): Promise<ElevationResult[]> {
  const surfaceResult = await guardSampleTerrainMostDetailedAsync(
    surfaceProvider,
    positions,
    rejectOnTileFail,
    true
  );
  const terrainResult = await guardSampleTerrainMostDetailedAsync(
    terrainProvider,
    positions,
    rejectOnTileFail,
    true
  );

  if (
    surfaceResult.length !== positions.length ||
    terrainResult.length !== positions.length
  ) {
    throw new Error(
      "[CESIUM|ELEVATION] elevation sampling failed - length mismatch"
    );
  }

  const results: ElevationResult[] = [];

  for (let i = 0; i < positions.length; i++) {
    const terrain = terrainResult[i];
    const position = positions[i];
    if (terrain === undefined || position === undefined) {
      throw new Error(
        `[CESIUM|ELEVATION] terrain or position data is undefined for index ${i}`
      );
    }

    results.push({
      position,
      terrain,
      surface: surfaceResult[i],
    });
  }

  return results;
}
