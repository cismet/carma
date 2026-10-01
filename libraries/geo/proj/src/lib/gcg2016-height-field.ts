import type { LngLatArray } from "@carma-geo/data-structures";
import { GCG2016_PROVENANCE } from "@carma-geo/gcg2016";
import { getGcg2016HeightAnomalies } from "./gcg2016";

type Bounds = Readonly<{
  west: number;
  south: number;
  east: number;
  north: number;
}>;
export type Gcg2016HeightField = Readonly<{
  bounds: Bounds;
  segments: number;
  values: Float64Array;
  sampledResidualMeters: number;
}>;

export const sampleGcg2016HeightField = (
  field: Gcg2016HeightField,
  longitude: number,
  latitude: number
): number => {
  const { bounds, segments, values } = field;
  const x = Math.max(
    0,
    Math.min(
      segments,
      ((longitude - bounds.west) / (bounds.east - bounds.west)) * segments
    )
  );
  const y = Math.max(
    0,
    Math.min(
      segments,
      ((latitude - bounds.south) / (bounds.north - bounds.south)) * segments
    )
  );
  const column = Math.min(segments - 1, Math.floor(x));
  const row = Math.min(segments - 1, Math.floor(y));
  const u = x - column,
    v = y - row,
    width = segments + 1;
  const bottom =
    values[row * width + column] * (1 - u) +
    values[row * width + column + 1] * u;
  const top =
    values[(row + 1) * width + column] * (1 - u) +
    values[(row + 1) * width + column + 1] * u;
  return bottom * (1 - v) + top * v;
};

/** Prepare the bundled quasigeoid once per tile, outside the vertex loop.
 * The residual is measured on every newly introduced midpoint, not a claimed
 * physical model accuracy. Conversion is h(ellipsoid) = H(DHHN2016) + offset.
 */
export const createGcg2016HeightField = async (
  requested: Bounds,
  signal?: AbortSignal
): Promise<Gcg2016HeightField> => {
  // The payload envelope includes cells whose five-by-five stencil crosses
  // its boundary. The elevation coverage is verified to have complete stencils.
  const [west, south, east, north] = GCG2016_PROVENANCE.elevationCoverage;
  const bounds = {
    west: Math.max(west, requested.west),
    south: Math.max(south, requested.south),
    east: Math.min(east - 1e-10, requested.east),
    north: Math.min(north - 1e-10, requested.north),
  };
  if (!(bounds.west < bounds.east && bounds.south < bounds.north))
    throw new RangeError("Terrain is outside the supported elevation coverage");
  let previous: Gcg2016HeightField | null = null;
  for (let segments = 2; segments <= 64; segments *= 2) {
    signal?.throwIfAborted();
    const coordinates: LngLatArray.deg[] = [];
    const indices: number[] = [];
    const values = new Float64Array((segments + 1) ** 2);
    for (let y = 0; y <= segments; y++)
      for (let x = 0; x <= segments; x++) {
        const index = y * (segments + 1) + x;
        if (previous && x % 2 === 0 && y % 2 === 0)
          values[index] =
            previous.values[(y / 2) * (previous.segments + 1) + x / 2];
        else {
          coordinates.push([
            bounds.west + (x / segments) * (bounds.east - bounds.west),
            bounds.south + (y / segments) * (bounds.north - bounds.south),
          ] as LngLatArray.deg);
          indices.push(index);
        }
      }
    let residual = 0;
    for (let start = 0; start < coordinates.length; start += 128) {
      signal?.throwIfAborted();
      const batch = coordinates.slice(start, start + 128);
      const offsets = await getGcg2016HeightAnomalies(batch);
      offsets.forEach((offset, i) => {
        values[indices[start + i]] = offset;
        if (previous)
          residual = Math.max(
            residual,
            Math.abs(offset - sampleGcg2016HeightField(previous, ...batch[i]))
          );
      });
      // Keep cancellation and time-input events serviceable even without a worker.
      if (start + 128 < coordinates.length)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const field: Gcg2016HeightField = {
      bounds,
      segments,
      values,
      sampledResidualMeters: residual,
    };
    if (previous && residual <= 0.001) return field;
    previous = field;
  }
  return previous!;
};
