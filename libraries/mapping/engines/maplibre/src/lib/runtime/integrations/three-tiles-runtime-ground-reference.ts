import type { Tile } from "3d-tiles-renderer/core";
import * as THREE from "three";

import type { ThreeTilesRuntimeState } from "./three-tiles-runtime-context";

/** Aligns a standalone tileset's ground with the map plane. */
export function createThreeTilesGroundReferenceProbe(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    "options" | "tiles" | "orientationGroup" | "offsetGroup" | "map"
  >
) {
  // A standalone tileset carries absolute heights but the map has no terrain
  // to lift its centre. Probe the tileset under the layer origin and lower the
  // whole set by that height, so its ground meets the map plane. Refined while
  // finer tiles arrive; settled once the hit comes from a fine tile.
  const groundProbe = new THREE.Raycaster();
  let groundReferenceSettled = false;
  const GROUND_REFERENCE_FINE_ERROR_METERS = 2;
  const probeGroundReference = (tile?: Tile) => {
    if (
      !runtimeState.options.selfGroundReference ||
      groundReferenceSettled ||
      !runtimeState.tiles
    )
      return;
    runtimeState.orientationGroup.updateMatrixWorld(true);
    const origin = runtimeState.orientationGroup.localToWorld(
      new THREE.Vector3(0, 10_000, 0)
    );
    const down = new THREE.Vector3(0, -1, 0).transformDirection(
      runtimeState.orientationGroup.matrixWorld
    );
    groundProbe.set(origin, down);
    groundProbe.far = 20_000;
    const hit = groundProbe
      .intersectObject(runtimeState.tiles.group, true)
      .find(({ object }) => (object as THREE.Mesh).isMesh && object.visible);
    if (!hit) return;
    // Local to the offset group: the tileset's own height, offset excluded.
    const groundMeters = runtimeState.offsetGroup.worldToLocal(
      hit.point.clone()
    ).y;
    if (!Number.isFinite(groundMeters)) return;
    if (Math.abs(runtimeState.offsetGroup.position.y + groundMeters) > 0.25) {
      runtimeState.offsetGroup.position.y = -groundMeters;
      runtimeState.map?.triggerRepaint();
    }
    if (
      (tile?.geometricError ?? Infinity) <= GROUND_REFERENCE_FINE_ERROR_METERS
    )
      groundReferenceSettled = true;
  };
  return probeGroundReference;
}
