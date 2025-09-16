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
  positions: Cartographic[]
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
    result = await sampleTerrainMostDetailed(provider, positions);
  } catch (e) {
    console.warn("[CESIUM|ELEVATION] elevation sampling failed", e);
  }
  return result;
}

export async function getTerrainElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[]
): Promise<Cartographic[]> {
  let result: Cartographic[] = [];
  await ctx.withTerrainProvider(async (p) => {
    result = await guardedSampleTerrainMostDetailedAsync(p, positions);
  });
  return result;
}

export async function getSurfaceElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[]
): Promise<Cartographic[]> {
  let result: Cartographic[] = [];
  await ctx.withSurfaceProvider(async (p) => {
    result = await guardedSampleTerrainMostDetailedAsync(p, positions);
  });
  return result;
}

/**
 * Prefer surface/mesh elevation when available, otherwise fall back to terrain.
 */
export async function getElevationAsync(
  ctx: CesiumContextType,
  positions: Cartographic[]
): Promise<ElevationResult[]> {
  let surfaceResult: Cartographic[] = [];
  let terrainResult: Cartographic[] = [];
  let result: ElevationResult[] = [];

  await ctx.withSurfaceProvider(
    async (p) =>
      (surfaceResult = await guardedSampleTerrainMostDetailedAsync(
        p,
        positions
      ))
  );
  await ctx.withTerrainProvider(
    async (p) =>
      (terrainResult = await guardedSampleTerrainMostDetailedAsync(
        p,
        positions
      ))
  );

  if (
    surfaceResult.length !== positions.length ||
    terrainResult.length !== positions.length
  ) {
    console.warn("[CESIUM|ELEVATION] elevation sampling failed");
    if (surfaceResult.length === positions.length) {
      console.warn(
        "[CESIUM|ELEVATION] terrain elevation sampling failed, applying surface elevations to all results"
      );
      terrainResult = surfaceResult;
    }
    if (terrainResult.length === positions.length) {
      console.warn(
        "[CESIUM|ELEVATION] surface elevation sampling failed, applying terrain elevations to all results"
      );
      surfaceResult = terrainResult;
    }
    if (surfaceResult.length !== positions.length) {
      console.warn(
        "[CESIUM|ELEVATION] elevation sampling failed, returning empty result"
      );
      return result;
    }
  }

  result = positions.map((p, i) => ({
    terrain: terrainResult[i],
    surface: surfaceResult[i],
  }));
  return result;
}
