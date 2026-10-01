import { WebGLCoordinateSystem } from "three";

import { idleRingAllowedError } from "./mesh-error-policy";
import { TILES_LOAD_POLICY } from "./tile-load-config";
import {
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
  type TileCameraSnapshot,
} from "./tile-camera-demand";
import type { TerrainSelectionInput } from "./terrain-selection-types";

const RESERVE_CAMERA_PREFIX = "terrain-base-ring";

/** Same nested projection and error bands as the native 3D-tiles reserve. */
export function createTerrainSelectionReserve(input: TerrainSelectionInput): {
  baseLevel: number | undefined;
  views: readonly TileCameraSnapshot[];
} {
  if (input.baseLevel === undefined) return { baseLevel: undefined, views: [] };
  if (!Number.isInteger(input.baseLevel))
    throw new RangeError("Terrain resident base level must be an integer");
  const baseLevel = Math.max(
    input.source.minzoom,
    Math.min(input.maximumLevel, input.baseLevel)
  );
  const views = TILES_LOAD_POLICY.idleRingTanMultipliers.map(
    (multiplier, index) => {
      const projectionMatrix = [...input.renderCamera.projectionMatrix];
      // Preserve the principal point, depth mapping and camera model.
      projectionMatrix[0] /= multiplier;
      projectionMatrix[5] /= multiplier;
      return {
        id: `${RESERVE_CAMERA_PREFIX}-${index + 1}`,
        projectionMatrix,
        matrixWorld: input.renderCamera.matrixWorld,
        coordinateSystem:
          input.renderCamera.coordinateSystem ?? WebGLCoordinateSystem,
        reversedDepth: input.renderCamera.reversedDepth ?? false,
        viewport: input.viewport,
        errorTargetPixels: idleRingAllowedError(
          Math.max(input.initialErrorTargetPixels, input.errorTargetPixels),
          index + 1,
          input.baseRingRefinementPasses ??
            TILES_LOAD_POLICY.idleRingRefinePassLimit,
          input.errorTargetPixels
        ),
        priority: TILE_CAMERA_PRIORITY.PREFETCH,
        role: TILE_CAMERA_ROLE.GEOMETRY,
      } satisfies TileCameraSnapshot;
    }
  );
  return { baseLevel, views };
}
