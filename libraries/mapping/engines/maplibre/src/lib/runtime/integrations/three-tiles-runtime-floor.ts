import * as THREE from "three";

import { readOrientedTileBounds } from "./three-tiles-bounds";
import {
  initialMeshLoadError,
  resolveExtentGeometricError,
  tilesetMinResolutionGeometricError,
} from "../../core/mesh-error-policy";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/**
 * The extent floor from the tileset's minimum resolution (TILES_COVERAGE.md,
 * rule R3): re-resolved whenever the requested resolution or the cache
 * ceiling changes, never finer than base × longest root axis / pixels, and
 * still bounded by the memory share and the hinted level.
 */
export const createTilesetMinResolutionService = (
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "options"
    | "tiles"
    | "requestedErrorTarget"
    | "ceilingBytes"
    | "extentGeometricError"
    | "extentFloorArmed"
    | "extentFloorAuditPending"
    | "tilesetMinResolutionPx"
    | "appliedTilesetMinResolutionPx"
    | "appliedTilesetMinCeilingBytes"
    | "rootLongestAxisMeters"
    | "tileBoundingBox"
    | "tileBoundsTransform"
  >,
  requestRender: () => void
): ThreeTilesRuntimeServices["applyTilesetMinResolution"] => {
  /**
   * Re-resolve the extent floor for the requested residual resolution: the
   * coarsest level whose error stays within base × axis / px, still bounded
   * by the memory share, even when that requires a coarser cut than the hint.
   */
  return () => {
    const px = runtimeState.tilesetMinResolutionPx;
    if (
      px === runtimeState.appliedTilesetMinResolutionPx &&
      runtimeState.ceilingBytes === runtimeState.appliedTilesetMinCeilingBytes
    )
      return;
    if (px !== null && !Number.isFinite(runtimeState.rootLongestAxisMeters)) {
      // The root's oriented box, once its metadata is processed.
      const bounds = (runtimeState.tiles?.root as RuntimeTile | undefined)
        ?.engineData?.boundingVolume;
      if (bounds && (bounds.getOBB || typeof bounds.getAABB === "function")) {
        readOrientedTileBounds(
          bounds,
          runtimeState.tileBoundingBox,
          runtimeState.tileBoundsTransform
        );
        const size = runtimeState.tileBoundingBox.getSize(new THREE.Vector3());
        runtimeState.rootLongestAxisMeters = Math.max(size.x, size.y, size.z);
      }
    }
    const entry = runtimeState.options.entry;
    const residual =
      px === null
        ? 0
        : tilesetMinResolutionGeometricError(
            initialMeshLoadError(
              runtimeState.requestedErrorTarget,
              runtimeState.options.baseErrorTargetPixels
            ),
            runtimeState.rootLongestAxisMeters,
            px
          );
    if (px !== null && residual === 0) return; // root axis not known yet
    runtimeState.appliedTilesetMinResolutionPx = px;
    runtimeState.appliedTilesetMinCeilingBytes = runtimeState.ceilingBytes;
    runtimeState.extentGeometricError = resolveExtentGeometricError(
      entry?.levels ?? [],
      runtimeState.ceilingBytes,
      residual
    );
    runtimeState.extentFloorAuditPending = runtimeState.extentFloorArmed;
    runtimeState.tiles?.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
};
