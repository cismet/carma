import { Cartographic, CesiumTerrainProvider } from "cesium";
import type { CesiumContextType } from "../CesiumContext";
import { guardSampleTerrainMostDetailedAsync } from "./guardSampleTerrainMostDetailedAsync";

export type ElevationResult = {
  terrain: Cartographic;
  surface?: Cartographic;
  position: Cartographic; // return original position for convenience
};

export async function getTerrainElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  let provider: CesiumTerrainProvider | undefined = undefined;
  ctx.withTerrainProvider((p) => (provider = p));
  if (!provider) return [];
  return guardSampleTerrainMostDetailedAsync(
    ctx,
    provider,
    positions,
    rejectOnTileFail,
    clonePositions
  );
}

export async function getSurfaceElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  let provider: CesiumTerrainProvider | undefined = undefined;
  ctx.withSurfaceProvider((p) => (provider = p));
  if (!provider) return [];
  return guardSampleTerrainMostDetailedAsync(
    ctx,
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
  ctx: CesiumContextType,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true
): Promise<ElevationResult[]> {
  const surfaceResult = await getSurfaceElevationAsync(
    ctx,
    positions,
    rejectOnTileFail,
    true
  );
  const terrainResult = await getTerrainElevationAsync(
    ctx,
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
