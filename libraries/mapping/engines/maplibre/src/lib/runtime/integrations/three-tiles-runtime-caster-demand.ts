import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Matrix4 } from "three";
import {
  receiverMatchedTileError,
  type ShadowReceiverMask,
  type ShadowReceiverMatch,
} from "../../core/shadow-receiver-mask";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** Same current-receiver geometric ratio as native caster traversal. Physical
 * screen error is telemetry; it must not relax a finer receiver's caster LOD.
 */
export function createCasterVolumeDemand(
  mask: ShadowReceiverMask | null,
  targetError: number
) {
  const box = new Box3(),
    transform = new Matrix4();
  const match: ShadowReceiverMatch = {
    receiverGeometricError: Infinity,
    receiverCenterness: 0,
    lightFacing: 0,
  };
  return (tile: Tile) => {
    const volume = (tile as RuntimeTile).engineData?.boundingVolume;
    if (!volume?.getAABB)
      return { intersects: true, errorPixels: Number.MAX_VALUE };
    readOrientedTileBounds(volume, box, transform);
    const intersects =
      mask?.match(box, match, transform, {
        key: tile,
        parent: tile.parent ?? undefined,
      }) ?? false;
    return {
      intersects,
      errorPixels: intersects
        ? Math.min(
            // Infinite quality demand still permits a drawable coarse fallback.
            Number.MAX_VALUE,
            receiverMatchedTileError(
              tile.geometricError,
              match.receiverGeometricError,
              targetError
            )
          )
        : 0,
    };
  };
}
