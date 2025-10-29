import {
  type Cartographic,
  type CesiumTerrainProvider,
  type EllipsoidTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";
import { isValidCesiumTerrainProvider } from "./CesiumTerrainProvider";
import { isValidEllipsoidTerrainProvider } from "./EllipsoidTerrainProvider";

/**
 * Wrap sampleTerrainMostDetailed with cloned positions by default
 * Guards against invalid terrain providers
 */
export async function sampleTerrainMostDetailedGuardedAsync(
  provider: CesiumTerrainProvider | EllipsoidTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
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
      clonePositions ? positions.map((p) => p.clone()) : positions,
      rejectOnTileFail
    );
  } catch (e) {
    console.warn("[CESIUM|ELEVATION] elevation sampling failed", e);
  }
  return result;
}

export default sampleTerrainMostDetailedGuardedAsync;
