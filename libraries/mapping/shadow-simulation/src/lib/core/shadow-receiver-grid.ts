import * as THREE from "three";

import type { ShadowReceiverCell } from "./shadow-page-plan";

/** Disjoint, scene-origin-aligned receiver cells. Bound the number of colour
 * passes, not their pixel resolution: larger views select a coarser world grid.
 * The page allocator still reports any unattainable screen-space demand.
 */
export const buildShadowReceiverGrid = (
  bounds: THREE.Box3
): readonly ShadowReceiverCell[] => {
  if (
    bounds.isEmpty() ||
    ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
  )
    return [];
  const size = bounds.getSize(new THREE.Vector3());
  const spacing =
    2 ** Math.ceil(Math.log2(Math.max(64, size.x / 4, size.z / 4)));
  const minY = Math.floor(bounds.min.y / 100) * 100;
  const maxY = Math.max(minY + 100, Math.ceil(bounds.max.y / 100) * 100);
  const cells: ShadowReceiverCell[] = [];
  for (
    let x = Math.floor(bounds.min.x / spacing);
    x <= Math.floor(bounds.max.x / spacing);
    x += 1
  ) {
    for (
      let z = Math.floor(bounds.min.z / spacing);
      z <= Math.floor(bounds.max.z / spacing);
      z += 1
    ) {
      cells.push({
        id: `${spacing}:${x}:${z}`,
        bounds: new THREE.Box3(
          new THREE.Vector3(x * spacing, minY, z * spacing),
          new THREE.Vector3((x + 1) * spacing, maxY, (z + 1) * spacing)
        ),
      });
    }
  }
  return cells;
};

/** Warm the eight-connected ring using the SAME world IDs as foreground pages.
 * Raster tile IDs or a second, coarser world grid would never produce cache hits
 * when panning into this ring. Only buffer demand and caster LOD are reduced.
 * Round-robin compass sectors keep a bounded offer from favouring one direction.
 */
export const buildShadowReceiverNeighbourRing = (
  cells: readonly ShadowReceiverCell[],
  maximumPages = 16
): readonly ShadowReceiverCell[] => {
  if (
    !Number.isInteger(maximumPages) ||
    maximumPages <= 0 ||
    cells.length === 0
  )
    return [];
  const envelope = cells.reduce(
    (bounds, cell) => bounds.union(cell.bounds),
    new THREE.Box3()
  );
  const center = envelope.getCenter(new THREE.Vector3());
  const active = new Set(cells.map(({ id }) => id));
  const candidates = new Map<string, ShadowReceiverCell>();
  for (const cell of cells) {
    const spacing = cell.bounds.max.x - cell.bounds.min.x;
    if (!(spacing > 0 && Number.isFinite(spacing))) continue;
    const x = Math.round(cell.bounds.min.x / spacing);
    const z = Math.round(cell.bounds.min.z / spacing);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const id = `${spacing}:${x + dx}:${z + dz}`;
        if (active.has(id) || candidates.has(id)) continue;
        candidates.set(id, {
          id,
          bounds: cell.bounds
            .clone()
            .translate(new THREE.Vector3(dx * spacing, 0, dz * spacing)),
        });
      }
    }
  }
  const sectors: ShadowReceiverCell[][] = Array.from({ length: 8 }, () => []);
  for (const candidate of candidates.values()) {
    const offset = candidate.bounds.getCenter(new THREE.Vector3()).sub(center);
    const sector =
      (Math.round(Math.atan2(offset.z, offset.x) / (Math.PI / 4)) + 8) % 8;
    sectors[sector].push(candidate);
  }
  for (const sector of sectors) {
    sector.sort(
      (a, b) =>
        a.bounds.distanceToPoint(center) - b.bounds.distanceToPoint(center) ||
        a.id.localeCompare(b.id)
    );
  }
  const result: ShadowReceiverCell[] = [];
  for (let depth = 0; result.length < maximumPages; depth += 1) {
    const round = sectors.flatMap((sector) =>
      sector[depth] ? [sector[depth]] : []
    );
    if (round.length === 0) break;
    result.push(...round.slice(0, maximumPages - result.length));
  }
  return result;
};

/** Use a measured one-coarser level from the runtime's settled selection. */
export const nearestIdleTerrainLevel = (
  bounds: THREE.Box3,
  regions: readonly Readonly<{
    receiverBounds: THREE.Box3;
    terrainLevel: number;
  }>[]
): number | null => {
  const center = bounds.getCenter(new THREE.Vector3());
  let nearest: number | null = null;
  let distance = Infinity;
  for (const region of regions) {
    const nextDistance = region.receiverBounds.distanceToPoint(center);
    if (nextDistance < distance && Number.isInteger(region.terrainLevel)) {
      distance = nextDistance;
      nearest = region.terrainLevel;
    }
  }
  return nearest;
};
