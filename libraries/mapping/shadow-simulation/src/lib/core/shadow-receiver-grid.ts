import * as THREE from "three";

import {
  shadowReceiverCorners,
  type ShadowReceiverCell,
} from "./shadow-page-plan";
import { getFrustumBoxIntersectionPoints } from "./frustum-box-intersection";

/** Fetch the full corridor that a visible native page captures, not merely its
 * screen-clipped portion. Callers retain startup coverage when this is empty;
 * offscreen caster volumes must never become receiver cells recursively.
 */
export const getVisibleShadowReceiverCorners = (
  cells: readonly ShadowReceiverCell[],
  camera: THREE.Camera
): readonly THREE.Vector3[] =>
  cells.flatMap(({ bounds }) =>
    getFrustumBoxIntersectionPoints(camera, bounds).length > 0
      ? shadowReceiverCorners(bounds)
      : []
  );

type ReceiverFootprint = Readonly<{
  west: number;
  east: number;
  south: number;
  north: number;
}>;

const RECEIVER_FRAGMENT_SIDE = {
  WEST: "west",
  EAST: "east",
  SOUTH: "south",
  NORTH: "north",
} as const;

type ReceiverFragment = ReceiverFootprint &
  Readonly<{ splitPath: readonly string[] }>;

type MergeableReceiverCell = ShadowReceiverCell &
  Readonly<{ fragmentMergeWidthMeters: number }>;

const receiverArea = ({ bounds }: ShadowReceiverCell): number =>
  (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);

const sharesCompleteReceiverEdge = (a: THREE.Box3, b: THREE.Box3): boolean =>
  (a.min.z === b.min.z &&
    a.max.z === b.max.z &&
    (a.max.x === b.min.x || b.max.x === a.min.x)) ||
  (a.min.x === b.min.x &&
    a.max.x === b.max.x &&
    (a.max.z === b.min.z || b.max.z === a.min.z));

/** Decision: rotated native bounds produce sub-centimetre AABB remainders.
 * A measured 88-receiver cut created 221 pages, including 135 strips narrower
 * than 10 cm covering only 0.065% of its area. Each incurred a complete shadow
 * capture. Join only narrow partition scraps to a larger, full-edge neighbor:
 * the exact rectangular union preserves every surface and both height ranges.
 * Discarding strips or snapping coordinates was rejected because it can leave
 * uncovered pixels. Ordinary native pages remain separate for local reuse.
 * This runs when the loaded cut changes, never for each sun-disc sample.
 */
const mergeNarrowReceiverFragments = (
  cells: readonly MergeableReceiverCell[]
): readonly ShadowReceiverCell[] => {
  const remaining = new Map(cells.map((cell) => [cell.id, cell]));
  let merged = true;
  while (merged) {
    merged = false;
    for (const fragment of remaining.values()) {
      const width = Math.min(
        fragment.bounds.max.x - fragment.bounds.min.x,
        fragment.bounds.max.z - fragment.bounds.min.z
      );
      if (width >= fragment.fragmentMergeWidthMeters) continue;
      const area = receiverArea(fragment);
      const neighbor = [...remaining.values()]
        .filter(
          (candidate) =>
            candidate !== fragment &&
            (receiverArea(candidate) > area ||
              (receiverArea(candidate) === area &&
                candidate.id < fragment.id)) &&
            sharesCompleteReceiverEdge(fragment.bounds, candidate.bounds)
        )
        .sort(
          (a, b) =>
            receiverArea(b) - receiverArea(a) ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        )[0];
      if (!neighbor) continue;
      remaining.set(neighbor.id, {
        ...neighbor,
        bounds: neighbor.bounds.clone().union(fragment.bounds),
      });
      remaining.delete(fragment.id);
      merged = true;
      break;
    }
  }
  return [...remaining.values()].map(({ id, bounds }) => ({ id, bounds }));
};

const receiverFootprint = (bounds: THREE.Box3): ReceiverFootprint => ({
  west: bounds.min.x,
  east: bounds.max.x,
  south: bounds.min.z,
  north: bounds.max.z,
});

const footprintsOverlap = (a: ReceiverFootprint, b: ReceiverFootprint) =>
  a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;

const subtractReceiverFootprint = (
  source: ReceiverFragment,
  occupied: ReceiverFootprint,
  occupiedId: string
): readonly ReceiverFragment[] => {
  if (!footprintsOverlap(source, occupied)) return [source];
  const west = Math.max(source.west, occupied.west);
  const east = Math.min(source.east, occupied.east);
  const south = Math.max(source.south, occupied.south);
  const north = Math.min(source.north, occupied.north);
  return [
    { ...source, east: west, side: RECEIVER_FRAGMENT_SIDE.WEST },
    { ...source, west: east, side: RECEIVER_FRAGMENT_SIDE.EAST },
    {
      west,
      east,
      south: source.south,
      north: south,
      side: RECEIVER_FRAGMENT_SIDE.SOUTH,
    },
    {
      west,
      east,
      south: north,
      north: source.north,
      side: RECEIVER_FRAGMENT_SIDE.NORTH,
    },
  ]
    .filter((part) => part.west < part.east && part.south < part.north)
    .map(({ side, ...part }) => ({
      ...part,
      splitPath: [...source.splitPath, occupiedId, side],
    }));
};

/** Partition complete source-tile footprints, never their observer-clipped bounds.
 * IDs must identify the source and spatial tile, not its preview/mesh quality.
 * Source-ID order resolves overlapping mesh AABBs deterministically. Only real
 * overlap changes can repartition a footprint; camera motion is not an input.
 * Each column includes all overlapping receiver heights, including roofs above
 * terrain. Fragment IDs encode owner/subtractor/side topology, not local
 * coordinates or height, so changing the scene origin does not rename pages.
 *
 * Supply the retained loaded descriptor set, then frustum-filter the result with
 * planShadowReceiverPages. Filtering descriptors first would change ownership
 * at a viewport edge. There is deliberately no truncation that drops receivers.
 */
export const buildShadowReceiverCells = (
  descriptors: readonly ShadowReceiverCell[]
): readonly ShadowReceiverCell[] => {
  const ids = new Set<string>();
  for (const { id, bounds } of descriptors) {
    if (
      ids.has(id) ||
      bounds.isEmpty() ||
      ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite)
    ) {
      throw new RangeError(
        "Receiver tiles require unique IDs and finite bounds"
      );
    }
    ids.add(id);
  }
  const ordered = [...descriptors].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const cells = ordered.flatMap(({ id, bounds }, index) => {
    const footprint = receiverFootprint(bounds);
    if (
      footprint.west === footprint.east ||
      footprint.south === footprint.north
    )
      return [];
    const fragments = ordered
      .slice(0, index)
      .reduce<readonly ReceiverFragment[]>(
        (remaining, previous) =>
          remaining.flatMap((part) =>
            subtractReceiverFootprint(
              part,
              receiverFootprint(previous.bounds),
              previous.id
            )
          ),
        [{ ...footprint, splitPath: [] }]
      );
    return fragments.map((part) => {
      const heights = ordered.reduce(
        (range, candidate) =>
          footprintsOverlap(part, receiverFootprint(candidate.bounds))
            ? ([
                Math.min(range[0], candidate.bounds.min.y),
                Math.max(range[1], candidate.bounds.max.y),
              ] as const)
            : range,
        [bounds.min.y, bounds.max.y] as readonly [number, number]
      );
      return {
        fragmentMergeWidthMeters:
          part.splitPath.length === 0
            ? 0
            : Math.max(
                0.1,
                0.01 *
                  Math.min(
                    footprint.east - footprint.west,
                    footprint.north - footprint.south
                  )
              ),
        id:
          part.splitPath.length === 0
            ? id
            : JSON.stringify([id, ...part.splitPath]),
        bounds: new THREE.Box3(
          new THREE.Vector3(part.west, heights[0], part.south),
          new THREE.Vector3(part.east, heights[1], part.north)
        ),
      };
    });
  });
  return mergeNarrowReceiverFragments(cells);
};

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
