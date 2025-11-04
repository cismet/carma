import {
  type Cartographic,
  type CesiumTerrainProvider,
  type EllipsoidTerrainProvider,
  sampleTerrainMostDetailed,
} from "cesium";
import { logOnce } from "@carma-commons/utils";
import { waitFrames } from "@carma-commons/utils/promise";
import {
  isValidCesiumTerrainProvider,
  isValidEllipsoidTerrainProvider,
} from "./instanceGates";

logOnce("[CESIUM|ELEVATION] using guarded sampleTerrainMostDetailedAsync");

// wrap sampleTerrainMostDetailed with cloned positions by default
export async function guardSampleTerrainMostDetailedAsync(
  provider: CesiumTerrainProvider | EllipsoidTerrainProvider,
  positions: Cartographic[],
  rejectOnTileFail: boolean = true,
  clonePositions: boolean = true, // whether to clone the positions array to avoid modifying input
  maxRetries: number = 3
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

  const clonedPositions = clonePositions
    ? positions.map((p) => p.clone())
    : positions;

  // Retry with exponential backoff (frame-based) with 3 second timeout
  const frameDelays = [1, 2, 3, 5]; // frames to wait between retries
  const maxDurationMs = 3000;
  const startTime = performance.now();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Check if we've exceeded the timeout
    if (performance.now() - startTime > maxDurationMs) {
      console.warn(
        `[CESIUM|ELEVATION] elevation sampling timed out after ${maxDurationMs}ms`
      );
      break;
    }

    try {
      result = await sampleTerrainMostDetailed(
        provider,
        clonedPositions,
        rejectOnTileFail
      );

      if (result.length > 0) {
        if (attempt > 0) {
          console.debug(
            `[CESIUM|ELEVATION] elevation sampling succeeded on retry ${attempt}`
          );
        }
        return result;
      }
    } catch (e) {
      const isLastAttempt = attempt === maxRetries;

      if (isLastAttempt) {
        console.warn(
          `[CESIUM|ELEVATION] elevation sampling failed after ${
            maxRetries + 1
          } attempts`,
          e
        );
      } else {
        const frames = frameDelays[attempt] || 5;
        console.debug(
          `[CESIUM|ELEVATION] elevation sampling failed (attempt ${
            attempt + 1
          }/${maxRetries + 1}), retrying in ${frames} frame(s)...`
        );
        await waitFrames(frames);
      }
    }
  }

  return result;
}

export default guardSampleTerrainMostDetailedAsync;
