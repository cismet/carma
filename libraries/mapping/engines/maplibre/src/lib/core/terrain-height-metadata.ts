import { assertTileId, terrainTileKey } from "./raster-dem-tile";

export const TERRAIN_HEIGHT_METADATA_VERSION = "native-raster-extents-v1";
export const MAX_TERRAIN_HEIGHT_METADATA_ENTRIES = 16_384;
const RECORD_WIDTH = 5;
export type TerrainHeightRange = readonly [minimum: number, maximum: number];

/** Exact tile/LOD extents, not a bound on resampled descendants. Dataset and
 * producer identity belong to the enclosing cache registration, never origin.
 * Decision: TERRAIN-VOLUMES-20260908 in engines/maplibre/README.md.
 */
export const decodeTerrainHeightMetadata = (
  value: unknown
): Map<string, TerrainHeightRange> => {
  const result = new Map<string, TerrainHeightRange>();
  if (
    !(value instanceof Float64Array) ||
    value.length % RECORD_WIDTH !== 0 ||
    value.length > MAX_TERRAIN_HEIGHT_METADATA_ENTRIES * RECORD_WIDTH
  )
    return result;
  for (let i = 0; i < value.length; i += RECORD_WIDTH) {
    const id = { level: value[i], x: value[i + 1], y: value[i + 2] };
    const minimum = value[i + 3],
      maximum = value[i + 4];
    try {
      assertTileId(id);
    } catch {
      return new Map();
    }
    if (
      id.level > 30 ||
      !Number.isFinite(minimum) ||
      !Number.isFinite(maximum) ||
      minimum > maximum
    )
      return new Map();
    result.set(terrainTileKey(id), [minimum, maximum]);
  }
  return result;
};

export const encodeTerrainHeightMetadata = (
  ranges: ReadonlyMap<string, TerrainHeightRange>
): Float64Array => {
  const rows = [...ranges].slice(-MAX_TERRAIN_HEIGHT_METADATA_ENTRIES);
  return new Float64Array(
    rows.flatMap(([key, range]) => [...key.split("/").map(Number), ...range])
  );
};

export const mergeTerrainHeightMetadata = (
  previous: unknown,
  update: Float64Array
): Float64Array => {
  const ranges = decodeTerrainHeightMetadata(previous);
  for (const [key, range] of decodeTerrainHeightMetadata(update)) {
    // Concurrent observations may use different generated mesh variants. Never
    // tighten an already observed extent within the same immutable dataset.
    const old = ranges.get(key);
    ranges.delete(key);
    ranges.set(
      key,
      old ? [Math.min(old[0], range[0]), Math.max(old[1], range[1])] : range
    );
  }
  return encodeTerrainHeightMetadata(ranges);
};
