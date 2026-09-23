import { Box3, Matrix4, Vector3 } from "three";
import {
  TILE_CAMERA_ROLE,
  type createTileCameraDemand,
} from "./tile-camera-demand";
import type { ShadowReceiverSource } from "./shadow-receiver-mask";

/** Clip receiver volumes with the same 3D frustums used for tile demand.
 * Decision: TILES_COVERAGE.md#visible-receiver-corridors. Separate views keep
 * separate sources; enclosing their union would request casters over the gap.
 */
export function clipShadowReceiverSources(
  sources: readonly ShadowReceiverSource[],
  demand: ReturnType<typeof createTileCameraDemand>,
  tilesToWorld: Matrix4
): ShadowReceiverSource[] {
  const views = demand.views.filter(
    (view) => view.role === TILE_CAMERA_ROLE.RECEIVER
  );
  return sources.flatMap((source) => {
    const boundsToWorld = tilesToWorld.clone();
    if (source.boundsTransform) boundsToWorld.multiply(source.boundsTransform);
    const corners: Vector3[] = [];
    for (const x of [source.bounds.min.x, source.bounds.max.x])
      for (const y of [source.bounds.min.y, source.bounds.max.y])
        for (const z of [source.bounds.min.z, source.bounds.max.z])
          corners.push(new Vector3(x, y, z).applyMatrix4(boundsToWorld));
    const extent = new Box3().setFromPoints(corners);
    const possible = views.filter((view) => view.frustum.intersectsBox(extent));
    // Interior receivers need no plane-triple clipping or extra per-view copy.
    if (
      possible.some((view) =>
        corners.every((point) => view.frustum.containsPoint(point))
      )
    )
      return [source];
    const worldToBounds = boundsToWorld.clone().invert();
    return possible.flatMap((view) => {
      const vertices = demand.intersectionVertices(
        source.bounds,
        view.id,
        boundsToWorld
      );
      return vertices.length === 0
        ? []
        : [
            {
              ...source,
              vertices: vertices.map((point) =>
                point.applyMatrix4(worldToBounds)
              ),
            },
          ];
    });
  });
}
