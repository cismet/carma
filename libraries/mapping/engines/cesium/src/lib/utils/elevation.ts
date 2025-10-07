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
    console.warn("[CESIUM|ELEVATION] elevation sampling failed");
    return [];
  }

  return positions.map((position, i) => ({
    position,
    terrain: terrainResult[i],
    surface: surfaceResult[i],
  }));
}
