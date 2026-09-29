import type { Tile } from "3d-tiles-renderer/core";
import { selectMeshShadowReserve } from "./mesh-shadow-reserve";
import { meshContentLevel } from "./mesh-shadow-retrieval";

/** Resolve shadow closure from prepared bounding volumes before fetching mesh
 * payloads. Only a stable topology can own downloads; intermediate caster cuts
 * would otherwise be downloaded, discarded and refined again. The caller keeps
 * its previous complete cut until geometry, materials and shadow closure agree.
 * One bounded step yields to native metadata preprocessing between rounds.
 */
export function planMeshShadowReserveStep(
  roots: readonly Tile[],
  refined: ReadonlySet<Tile>,
  ready: (tile: Tile) => boolean,
  requiredCasterLevel: (
    frontier: ReadonlySet<Tile>
  ) => (tile: Tile) => number | undefined
) {
  const topology = selectMeshShadowReserve(roots, refined, () => true);
  const nextRefined = new Set(refined);
  const blocked = new Set<Tile>();
  if (!topology.ready)
    return {
      ...topology,
      ready: false,
      refined: nextRefined,
      shadowReady: false,
      advance: false,
      blocked,
    };
  const requiredLevel = requiredCasterLevel(topology.frontier);
  for (const tile of topology.frontier) {
    if (meshContentLevel(tile) >= (requiredLevel(tile) ?? -1)) continue;
    if (tile.children?.length) nextRefined.add(tile);
    else blocked.add(tile);
  }
  const advance = nextRefined.size > refined.size;
  if (advance || blocked.size)
    return {
      ...topology,
      ready: false,
      refined: nextRefined,
      shadowReady: false,
      advance,
      blocked,
    };
  const reserve = selectMeshShadowReserve(roots, nextRefined, ready);
  return {
    ...reserve,
    refined: nextRefined,
    shadowReady: reserve.ready,
    advance: false,
    blocked,
  };
}
