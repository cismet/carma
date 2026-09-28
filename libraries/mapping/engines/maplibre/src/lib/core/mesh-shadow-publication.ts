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
    {
      published: previous,
      allowCoarseBootstrap: true,
      releaseEmptyReplacementRegions: true,
    }
  ).tiles;
  return { receivers: selectExclusiveShadowCut(receivers, previous), pending };
}

/** Viewport geometry has one LOD owner. Reuse those exact Tile objects for
 * depth; the light selector only owns additional caster content. All receiver
 * corridors share one union and a monotone, non-overlapping REPLACE cut.
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
    eligible,
    false
  );
  return independent;
}

/** Receiver colour and shadow depth use the same replacement boundary. */
const selectExclusiveShadowCut = (
  proposed: Set<Tile>,
  previous: ReadonlySet<Tile>
): Set<Tile> => {
  // Decision: ../../../TILES_COVERAGE.md#exclusive-shadow-caster-handover
  // While shadows are active neither colour nor depth can combine different
  // approximations of the same surface. The shared coverage selector keeps a
  // parent while any demanded child branch is missing. Suppress its new
  // descendants until that fallback disappears from the complete cut.
  const retainedAncestors = new Set<Tile>();
  for (const tile of proposed) {
    if (!previous.has(tile)) continue;
    for (const parent of meshTileAncestors(tile)) retainedAncestors.add(parent);
  }
  // A newly expanded corridor may need an uncovered sibling of existing fine
  // casters. Do not reintroduce their coarse ancestor over live fine depth;
  // retain that detail and let receiver readiness wait for the missing branch.
  for (const tile of proposed)
    if (tile.refine === "REPLACE" && retainedAncestors.has(tile))
      proposed.delete(tile);
  return new Set(
    [...proposed].filter(
      (tile) =>
        ![...meshTileAncestors(tile)].some(
          (parent) => parent.refine === "REPLACE" && proposed.has(parent)
        )
    )
  );
};
