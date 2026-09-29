import type { Tile } from "3d-tiles-renderer/core";
import { Box3, Matrix4 } from "three";
import {
  receiverMatchedTileError,
  type ShadowReceiverMask,
  type ShadowReceiverMatch,
} from "../../core/shadow-receiver-mask";
import { readOrientedTileBounds } from "./three-tiles-bounds";
import type { RuntimeTile } from "./three-tiles-runtime-types";

/** Parallel sun-ray membership and receiver-relative LOD share one demand.
 * The fitted shadow-map camera must not add a second quality target or cut off
 * a valid upstream caster. Its pose is already captured in the receiver mask.
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
      return {
        intersects: true,
        errorPixels: Number.MAX_VALUE,
        receiverGeometricError: 0,
      };
    readOrientedTileBounds(volume, box, transform);
    const intersects =
      mask?.match(box, match, transform, {
        key: tile,
        parent: tile.parent ?? undefined,
      }) ?? false;
    return {
      intersects,
      receiverGeometricError: intersects ? match.receiverGeometricError : 0,
      receiverContentLevel: intersects ? match.receiverContentLevel : undefined,
      errorPixels: intersects
        ? Math.min(
            // Keep the traversal metric finite; publication uses the exact geometric limit.
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
