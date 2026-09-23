import type { Tile } from "3d-tiles-renderer/core";
import { isLoadedMesh, meshTileAncestors } from "./mesh-tile-coverage";
import {
  refineLoadedMeshFrontier,
  selectMeshReceiverPlan,
} from "./mesh-tile-selection";

/** New receiver geometry needs drawable caster coverage, at any LOD. Existing
 * receivers remain until their demand-relative child branches can replace them.
 * Decision: TILES_COVERAGE.md#visible-receiver-corridors.
 */
export function selectShadowReadyReceivers(
  root: Tile,
  proposed: ReadonlySet<Tile>,
  previous: ReadonlySet<Tile>,
  inView: (tile: Tile) => boolean,
  casterCoverageReady: (tile: Tile) => boolean
) {
  const pending = new Set<Tile>();
  const ready = new Set(previous);
  const ancestors = new Set<Tile>();
  for (const tile of previous) {
    if (inView(tile))
      for (const parent of meshTileAncestors(tile)) ancestors.add(parent);
  }
  for (const tile of proposed) {
    for (const parent of meshTileAncestors(tile)) ancestors.add(parent);
    if (previous.has(tile) || casterCoverageReady(tile)) ready.add(tile);
    else pending.add(tile);
  }
  const receivers = selectMeshReceiverPlan(
    root,
    1,
    Number.MAX_VALUE,
    inView,
    (tile) => (proposed.has(tile) ? 0 : Number.MAX_VALUE),
    (tile) => ready.has(tile),
    ancestors,
    { published: previous, allowCoarseBootstrap: true }
  ).tiles;
  return { receivers, pending };
}

/** Viewport geometry has one LOD owner. Reuse those exact Tile objects for
 * depth; the light selector only owns additional caster content. All receiver
 * corridors share one union and a monotone previous caster cut.
 */
export function selectShadowCasterPlan(
  available: ReadonlySet<Tile>,
  previous: ReadonlySet<Tile>,
  receivers: ReadonlySet<Tile>,
  inView: (tile: Tile) => boolean,
  inCorridor: (tile: Tile) => boolean,
  errorPixels: (tile: Tile) => number,
  target: number
): Set<Tile> {
  const reused = new Set([...receivers].filter(inView));
  const eligible = (tile: Tile) =>
    isLoadedMesh(tile) &&
    (reused.has(tile) || previous.has(tile) || !inView(tile));
  const independent = refineLoadedMeshFrontier(
    new Set([...available, ...previous, ...reused].filter(eligible)),
    target,
    (tile) => reused.has(tile) || inCorridor(tile),
    (tile) => (reused.has(tile) ? 0 : errorPixels(tile)),
    new Set([...previous, ...reused]),
    eligible
  );
  return new Set([...independent, ...reused]);
}
