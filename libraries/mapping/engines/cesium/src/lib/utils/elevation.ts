import {
  Cartographic,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";
import type { CesiumContextType } from "../CesiumContext";
import {
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
} from "./instanceGates";

export type ElevationResult = { terrain: Cartographic; surface?: Cartographic };

/**
 * Sample elevations from a concrete CesiumTerrainProvider (can be a real terrain or a surface-derived provider).
 * Returns a Promise resolving to an array of ElevationResult objects.
 */
export async function guardedSampleTerrainMostDetailedAsync(
  provider: CesiumTerrainProvider | EllipsoidTerrainProvider,
  positions: Cartographic[],
  clonePositions: boolean = true // whether to clone the positions array to avoid modifying input
): Promise<Cartographic[]> {
  let result: Cartographic[] = [];
  if (
    !isValidCesiumTerrainProvider(provider) &&
    !isValidEllipsoidTerrainProvider(provider)
  ) {
    console.warn(
      "[CESIUM|ELEVATION] invalid terrain provider, skipping elevation sampling",
      provider
    );
    return result;
  }
  try {
    result = await sampleTerrainMostDetailed(
      provider,
      clonePositions ? positions.map((p) => p.clone()) : positions
    );
  } catch (e) {
    console.warn("[CESIUM|ELEVATION] elevation sampling failed", e);
  }
  return result;
}

export async function getTerrainElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[],
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  let provider: CesiumTerrainProvider | undefined = undefined;
  ctx.withTerrainProvider((p) => (provider = p));
  if (!provider) return [];
  return guardedSampleTerrainMostDetailedAsync(
    provider,
    positions,
    clonePositions
  );
}

export async function getSurfaceElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[],
  clonePositions: boolean = true
): Promise<Cartographic[]> {
  let provider: CesiumTerrainProvider | undefined = undefined;
  ctx.withSurfaceProvider((p) => (provider = p));
  if (!provider) return [];
  return guardedSampleTerrainMostDetailedAsync(
    provider,
    positions,
    clonePositions
  );
}

/**
 * Prefer surface/mesh elevation when available, otherwise fall back to terrain.
 */
export async function getElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[]
): Promise<ElevationResult[]> {
  const surfaceResult = await getSurfaceElevationAsync(ctx, positions, true);
  const terrainResult = await getTerrainElevationAsync(ctx, positions, true);

  if (
    surfaceResult.length !== positions.length ||
    terrainResult.length !== positions.length
  ) {
    console.warn("[CESIUM|ELEVATION] elevation sampling failed");
    return [];
  }

  return positions.map((p, i) => ({
    terrain: terrainResult[i],
    surface: surfaceResult[i],
  }));
}
