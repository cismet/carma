import { Cartographic, CesiumTerrainProvider } from "@carma/cesium";
import { logOnce } from "@carma-commons/utils";
import { guardSampleTerrainMostDetailedAsync } from "./guardSampleTerrainMostDetailedAsync";

logOnce(
  "[CESIUM|ELEVATION] Using legacy elevation utils, consider migrating to new @carma/cesium elevation helpers."
);

export type ElevationResult = {
  terrain: Cartographic;
  surface?: Cartographic;
  position: Cartographic; // return original position for convenience
};

export async function getTerrainElevationAsync(
  provider: CesiumTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  if (!provider) {
    console.debug("[CESIUM|ELEVATION] No terrain provider available");
    return [];
  }
  console.debug("[CESIUM|ELEVATION] Sampling terrain provider (DEM)");
  return guardSampleTerrainMostDetailedAsync(
    provider,
    positions,
    rejectOnTileFail,
    clonePositions
  );
}

export async function getSurfaceElevationAsync(
  provider: CesiumTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  if (!provider) {
    console.debug("[CESIUM|ELEVATION] No surface provider available");
    return [];
  }
  console.debug("[CESIUM|ELEVATION] Sampling surface provider (DSM)");
  return guardSampleTerrainMostDetailedAsync(
    provider,
    positions,
    rejectOnTileFail,
    clonePositions
  );
}

/**
 * Prefer surface/mesh elevation when available, otherwise fall back to terrain.
 */
export async function getElevationAsync(
  terrainProvider: CesiumTerrainProvider,
  surfaceProvider: CesiumTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true
): Promise<ElevationResult[]> {
  const surfaceResult = await getSurfaceElevationAsync(
    surfaceProvider,
    positions,
    rejectOnTileFail,
    true
  );
  const terrainResult = await getTerrainElevationAsync(
    terrainProvider,
    positions,
    rejectOnTileFail,
    true
  );

  const hasSurfaceProvider = surfaceResult.length > 0;
  const hasTerrainProvider = terrainResult.length > 0;

  if (!hasTerrainProvider) {
    console.warn("[CESIUM|ELEVATION] terrain provider failed or not available");
    return [];
  }

  if (terrainResult.length !== positions.length) {
    console.warn("[CESIUM|ELEVATION] terrain sampling failed");
    return [];
  }

  if (hasSurfaceProvider && surfaceResult.length !== positions.length) {
    console.warn("[CESIUM|ELEVATION] surface sampling failed");
    return [];
  }

  return positions.map((position, i) => ({
    position,
    terrain: terrainResult[i],
    surface: hasSurfaceProvider ? surfaceResult[i] : undefined,
  }));
}
