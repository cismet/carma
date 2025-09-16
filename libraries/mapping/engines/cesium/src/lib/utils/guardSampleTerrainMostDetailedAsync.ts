import {
  type Cartographic,
  type CesiumTerrainProvider,
  type EllipsoidTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";

import { pushDebugStack } from "./debugStack";
import {
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
} from "./instanceGates";
import type { CesiumContextType } from "../CesiumContext";

export async function guardSampleTerrainMostDetailedAsync(
  ctx: CesiumContextType,
  provider: CesiumTerrainProvider | EllipsoidTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true, // whether to reject if any tile fails to load
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
  pushDebugStack(ctx, 1);
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

export default guardSampleTerrainMostDetailedAsync;
