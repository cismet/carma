import {
  assertTileId,
  boundsIntersect,
  getTileBounds,
  latitudeToTileY,
  longitudeToTileX,
  terrainTileKey,
  type TerrainTileBounds,
  type TerrainTileId,
} from "./raster-dem-tile";
import { terrainTileContains } from "../runtime/integrations/terrain-tile-frontier";
import type {
  TerrainSelectionEntry,
  TerrainSelectionSourceMetadata,
} from "./terrain-selection";

const MAXIMUM_PREFETCH_TILES = 16;

export const TERRAIN_IDLE_SHADOW_REASON = {
  unavailable: "unavailable",
  budget: "budget",
  missing: "missing",
  overlap: "overlap",
  aborted: "aborted",
} as const;

export type TerrainIdleShadowReason =
  (typeof TERRAIN_IDLE_SHADOW_REASON)[keyof typeof TERRAIN_IDLE_SHADOW_REASON];

export type TerrainIdleShadowPlanInput = Readonly<{
  /** Already widened for the receiver, light reach, guard and solar disc. */
  casterBounds: TerrainTileBounds;
  terrainLevel: number;
  source: Pick<
    TerrainSelectionSourceMetadata,
    "bounds" | "minzoom" | "maxzoom"
  >;
  /** Published geometry only, including incomplete/no-data tiles. */
  activeTiles: readonly Readonly<{ id: TerrainTileId; complete: boolean }>[];
  isAvailable: (id: TerrainTileId) => boolean;
}>;

/**
 * Exact-LOD coverage preflight, not the foreground selector's adaptive budget.
 * Reject partial overlaps instead of stacking a coarse speculative surface on
 * the visible fine cut. A complete active cut remains owned by the host scene.
 */
export const planTerrainIdleShadowRegion = ({
  casterBounds,
  terrainLevel,
  source,
  activeTiles,
  isAvailable,
}: TerrainIdleShadowPlanInput): Readonly<{
  entries: readonly TerrainSelectionEntry[];
  reason?: TerrainIdleShadowReason;
}> => {
  const fail = (reason: TerrainIdleShadowReason) => ({ entries: [], reason });
  try {
    validateBounds(casterBounds);
    validateBounds(source.bounds);
    for (const { id } of activeTiles) assertTileId(id);
  } catch {
    return fail(TERRAIN_IDLE_SHADOW_REASON.unavailable);
  }
  if (
    !Number.isInteger(terrainLevel) ||
    !Number.isInteger(source.minzoom) ||
    !Number.isInteger(source.maxzoom) ||
    source.minzoom < 0 ||
    source.maxzoom < source.minzoom ||
    terrainLevel < 0 ||
    terrainLevel > 30 ||
    terrainLevel < source.minzoom ||
    terrainLevel > source.maxzoom ||
    activeTiles.some(({ id }) => id.level > 30) ||
    // World-copy and antimeridian corridors need a split world-space lease.
    // The normal ring planner still supports wrapping; this lease fails closed.
    casterBounds.west >= casterBounds.east ||
    casterBounds.north > getTileBounds({ level: 0, x: 0, y: 0 }).north ||
    casterBounds.south < getTileBounds({ level: 0, x: 0, y: 0 }).south ||
    casterBounds.south < source.bounds.south ||
    casterBounds.north > source.bounds.north ||
    !(source.bounds.west <= source.bounds.east
      ? casterBounds.west >= source.bounds.west &&
        casterBounds.east <= source.bounds.east
      : casterBounds.west >= source.bounds.west ||
        casterBounds.east <= source.bounds.east)
  )
    return fail(TERRAIN_IDLE_SHADOW_REASON.unavailable);

  // Only remove floating-point round-trip noise at exact tile boundaries.
  const gridCoordinate = (value: number) => {
    const integer = Math.round(value);
    return Math.abs(value - integer) <=
      Number.EPSILON * Math.max(1, Math.abs(value)) * 8
      ? integer
      : value;
  };
  const minX = Math.floor(
    gridCoordinate(longitudeToTileX(casterBounds.west, terrainLevel))
  );
  const maxX =
    Math.ceil(
      gridCoordinate(longitudeToTileX(casterBounds.east, terrainLevel))
    ) - 1;
  const minY = Math.floor(
    gridCoordinate(latitudeToTileY(casterBounds.north, terrainLevel))
  );
  const maxY =
    Math.ceil(
      gridCoordinate(latitudeToTileY(casterBounds.south, terrainLevel))
    ) - 1;
  const count = (maxX - minX + 1) * (maxY - minY + 1);
  if (
    count < 1 ||
    !Number.isSafeInteger(count) ||
    count > MAXIMUM_PREFETCH_TILES
  )
    return fail(TERRAIN_IDLE_SHADOW_REASON.budget);

  const entries: TerrainSelectionEntry[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const id = { level: terrainLevel, x, y };
      const overlapping = activeTiles.filter(
        (active) =>
          terrainTileContains(active.id, id) ||
          terrainTileContains(id, active.id)
      );
      if (overlapping.some(({ complete }) => !complete))
        return fail(TERRAIN_IDLE_SHADOW_REASON.missing);
      if (overlapping.some((active) => terrainTileContains(active.id, id)))
        continue;
      if (overlapping.length > 0) {
        const uniqueCut: TerrainTileId[] = [];
        for (const active of overlapping.sort(
          (a, b) => a.id.level - b.id.level
        )) {
          if (
            !uniqueCut.some((ancestor) =>
              terrainTileContains(ancestor, active.id)
            )
          )
            uniqueCut.push(active.id);
        }
        const coveredArea = uniqueCut.reduce(
          (area, active) => area + 4 ** (terrainLevel - active.level),
          0
        );
        if (coveredArea === 1) continue;
        return fail(TERRAIN_IDLE_SHADOW_REASON.overlap);
      }
      try {
        if (!isAvailable(id)) return fail(TERRAIN_IDLE_SHADOW_REASON.missing);
      } catch {
        return fail(TERRAIN_IDLE_SHADOW_REASON.missing);
      }
      entries.push({ id, kind: "source" });
    }
  }
  return { entries };
};

export type TerrainIdlePrefetchInput = Readonly<{
  /** Only the final visible cut seeds the ring, never previous prefetch results. */
  visibleEntries: readonly TerrainSelectionEntry[];
  /** The complete foreground selection, including offscreen shadow casters. */
  requiredEntries: readonly TerrainSelectionEntry[];
  source: Pick<
    TerrainSelectionSourceMetadata,
    "bounds" | "minzoom" | "maxzoom"
  >;
  viewportBounds: TerrainTileBounds;
  /** Exact source tile keys, not the source's geographic availability flags. */
  cachedTileKeys?: ReadonlySet<string>;
  /** May reduce, but never increase, the hard per-snapshot limit of 16. */
  maximumTiles?: number;
}>;

const validateBounds = (bounds: TerrainTileBounds) => {
  if (
    !Object.values(bounds).every(Number.isFinite) ||
    bounds.west < -180 ||
    bounds.west > 180 ||
    bounds.east < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    bounds.south >= bounds.north ||
    bounds.west === bounds.east
  )
    throw new RangeError("Prefetch bounds must be finite geographic bounds");
};

const intersectsSource = (
  tile: TerrainTileBounds,
  source: TerrainTileBounds
): boolean =>
  source.west <= source.east
    ? boundsIntersect(tile, [
        source.west,
        source.south,
        source.east,
        source.north,
      ])
    : boundsIntersect(tile, [source.west, source.south, 180, source.north]) ||
      boundsIntersect(tile, [-180, source.south, source.east, source.north]);

/**
 * Pure, bounded speculation. Each visible tile contributes the eight neighbours
 * of its parent; candidates never become seeds. This does not publish geometry,
 * allocate shadows, schedule work or claim that foreground coverage is settled.
 */
export const planTerrainIdlePrefetch = ({
  visibleEntries,
  requiredEntries,
  source,
  viewportBounds,
  cachedTileKeys = new Set<string>(),
  maximumTiles = MAXIMUM_PREFETCH_TILES,
}: TerrainIdlePrefetchInput): readonly TerrainSelectionEntry[] => {
  validateBounds(source.bounds);
  validateBounds(viewportBounds);
  if (
    !Number.isInteger(source.minzoom) ||
    !Number.isInteger(source.maxzoom) ||
    source.minzoom < 0 ||
    source.maxzoom < source.minzoom ||
    !Number.isInteger(maximumTiles) ||
    maximumTiles < 0
  )
    throw new RangeError(
      "Prefetch levels and tile limit must be valid integers"
    );
  for (const { id } of [...visibleEntries, ...requiredEntries])
    assertTileId(id);
  const limit = Math.min(MAXIMUM_PREFETCH_TILES, maximumTiles);
  if (visibleEntries.length === 0 || limit === 0) return [];

  const longitudeSpan =
    viewportBounds.east >= viewportBounds.west
      ? viewportBounds.east - viewportBounds.west
      : viewportBounds.east + 360 - viewportBounds.west;
  const centerLongitude =
    ((viewportBounds.west + longitudeSpan / 2 + 180) % 360) - 180;
  const centerX = longitudeToTileX(centerLongitude, 0);
  const centerY = latitudeToTileY(
    (viewportBounds.south + viewportBounds.north) / 2,
    0
  );
  const distanceToView = (id: TerrainTileId): number => {
    const scale = 2 ** id.level;
    const deltaX = Math.abs((id.x + 0.5) / scale - centerX);
    const deltaY = (id.y + 0.5) / scale - centerY;
    return Math.min(deltaX, 1 - deltaX) ** 2 + deltaY ** 2;
  };
  const foreground = [...visibleEntries, ...requiredEntries];
  const parents = new Set<string>();
  const candidates = new Map<string, TerrainSelectionEntry>();
  for (const { id } of visibleEntries) {
    const level = id.level - 1;
    if (level < source.minzoom || level > source.maxzoom) continue;
    if (!intersectsSource(getTileBounds(id), source.bounds)) continue;
    const parent = { level, x: Math.floor(id.x / 2), y: Math.floor(id.y / 2) };
    const parentKey = terrainTileKey(parent);
    if (parents.has(parentKey)) continue;
    parents.add(parentKey);
    const scale = 2 ** level;
    for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
      for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
        if (deltaX === 0 && deltaY === 0) continue;
        const y = parent.y + deltaY;
        // The longitude grid is periodic; the poles never wrap.
        if (y < 0 || y >= scale) continue;
        const candidate = {
          level,
          x: (parent.x + deltaX + scale) % scale,
          y,
        };
        const key = terrainTileKey(candidate);
        if (
          candidates.has(key) ||
          cachedTileKeys.has(key) ||
          !intersectsSource(getTileBounds(candidate), source.bounds) ||
          foreground.some(
            ({ id: required }) =>
              terrainTileContains(candidate, required) ||
              terrainTileContains(required, candidate)
          )
        )
          continue;
        candidates.set(key, { id: candidate, kind: "source" });
      }
    }
  }
  return [...candidates.values()]
    .sort(
      (left, right) =>
        distanceToView(left.id) - distanceToView(right.id) ||
        left.id.level - right.id.level ||
        left.id.x - right.id.x ||
        left.id.y - right.id.y
    )
    .slice(0, limit);
};
