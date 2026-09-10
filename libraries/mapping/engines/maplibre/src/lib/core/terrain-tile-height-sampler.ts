import { Triangle, Vector3 } from "three";

import { NO_DATA_EPSILON_METERS } from "./terrain-no-data";
import {
  latitudeToTileY,
  type TerrainTile,
  type TerrainTileBounds,
} from "./raster-dem-tile";

type HeightSampler = (
  longitude: number,
  latitude: number
) => number | undefined;
type SampleCoordinates = (index: number, target: Vector3) => Vector3;

const sampleLatitude = (bounds: TerrainTileBounds, latitude: number) => {
  const north = latitudeToTileY(bounds.north, 0);
  const south = latitudeToTileY(bounds.south, 0);
  return (south - latitudeToTileY(latitude, 0)) / (south - north);
};

const findSpan = (
  axis: Float32Array | Float64Array,
  value: number,
  descending = false
) => {
  let lower = 0;
  let upper = axis.length - 1;
  while (upper - lower > 1) {
    const middle = (lower + upper) >> 1;
    if (descending ? axis[middle] > value : axis[middle] < value)
      lower = middle;
    else upper = middle;
  }
  return lower;
};

const makeSampler = (
  bounds: TerrainTileBounds,
  heights: Float32Array,
  coordinates: SampleCoordinates,
  findTriangles: (
    u: number,
    v: number,
    sample: (a: number, b: number, c: number) => number | undefined
  ) => number | undefined,
  noDataHeightMeters?: number
): HeightSampler => {
  const point = new Vector3();
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const weights = new Vector3();
  const available = (height: number) =>
    Number.isFinite(height) &&
    (noDataHeightMeters === undefined ||
      Math.abs(height - noDataHeightMeters) > NO_DATA_EPSILON_METERS);
  const sample = (ia: number, ib: number, ic: number) => {
    const ha = heights[ia];
    const hb = heights[ib];
    const hc = heights[ic];
    // Match relief partitioning: never bridge a triangle across missing data.
    if (!available(ha) || !available(hb) || !available(hc)) return undefined;
    if (
      !Triangle.getBarycoord(
        point,
        coordinates(ia, a),
        coordinates(ib, b),
        coordinates(ic, c),
        weights
      ) ||
      weights.x < -1e-7 ||
      weights.y < -1e-7 ||
      weights.z < -1e-7
    )
      return undefined;
    return ha * weights.x + hb * weights.y + hc * weights.z;
  };
  return (longitude, latitude) => {
    if (
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < bounds.west ||
      longitude > bounds.east ||
      latitude < bounds.south ||
      latitude > bounds.north
    )
      return undefined;
    const u = (longitude - bounds.west) / (bounds.east - bounds.west);
    const v = sampleLatitude(bounds, latitude);
    point.set(u, v, 0);
    return findTriangles(u, v, sample);
  };
};

/** A mesh-lifetime fallback when a persistent restore has no source raster.
 * Own the height samples and compact axes, never the source cache's whole Blob.
 * Native grids need O(log n) lookup and at most eighteen triangle probes, even
 * with their nonuniform pixel-center/interpolated boundary ring.
 */
export const createTerrainTileHeightSampler = (
  tile: TerrainTile,
  noDataHeightMeters?: number
): HeightSampler | null => {
  if (
    !tile.bounds ||
    !(tile.u instanceof Float32Array) ||
    !(tile.v instanceof Float32Array) ||
    !(tile.heightMeters instanceof Float32Array) ||
    !(tile.indices instanceof Uint32Array) ||
    tile.u.length !== tile.v.length ||
    tile.u.length !== tile.heightMeters.length
  )
    return null;
  const width = tile.northIndices?.length ?? 0;
  const height = tile.westIndices?.length ?? 0;
  const bounds = { ...tile.bounds };
  if (!(bounds.east > bounds.west && bounds.north > bounds.south)) return null;
  if (
    width >= 2 &&
    height >= 2 &&
    width * height === tile.heightMeters.length &&
    tile.southIndices.length === width &&
    tile.eastIndices.length === height &&
    tile.northIndices.every((index, column) => index === column) &&
    tile.westIndices.every((index, row) => index === row * width)
  ) {
    const boundaryU = Float32Array.from(tile.u.subarray(0, width));
    const interiorU = Float32Array.from(tile.u.subarray(width, width * 2));
    const boundaryV = new Float64Array(height);
    const interiorV = new Float64Array(height);
    for (let row = 0; row < height; row++) {
      boundaryV[row] = sampleLatitude(
        bounds,
        bounds.south + tile.v[row * width] * (bounds.north - bounds.south)
      );
      interiorV[row] = sampleLatitude(
        bounds,
        bounds.south + tile.v[row * width + 1] * (bounds.north - bounds.south)
      );
    }
    return makeSampler(
      bounds,
      Float32Array.from(tile.heightMeters),
      (index, target) => {
        const row = Math.floor(index / width);
        const column = index % width;
        return target.set(
          (row === 0 || row === height - 1 ? boundaryU : interiorU)[column],
          (column === 0 || column === width - 1 ? boundaryV : interiorV)[row],
          0
        );
      },
      (u, v, sample) => {
        const column = findSpan(boundaryU, u);
        const row = findSpan(boundaryV, v, true);
        // The native pixel-center grid differs from the uniform boundary ring
        // by less than one cell. Check its immediate neighbours, not the mesh.
        for (
          let y = Math.max(0, row - 1);
          y <= Math.min(height - 2, row + 1);
          y++
        ) {
          for (
            let x = Math.max(0, column - 1);
            x <= Math.min(width - 2, column + 1);
            x++
          ) {
            const northWest = y * width + x;
            const southWest = northWest + width;
            const result =
              sample(northWest, southWest, northWest + 1) ??
              sample(northWest + 1, southWest, southWest + 1);
            if (result !== undefined) return result;
          }
        }
        return undefined;
      },
      noDataHeightMeters
    );
  }
  // Small irregular tiles are useful for existing providers/tests. Do not turn
  // an unsupported large topology into a full triangle scan for every label.
  if (tile.heightMeters.length > 256 || tile.indices.length > 768) return null;
  const u = Float32Array.from(tile.u);
  const v = new Float64Array(tile.v.length);
  for (let index = 0; index < v.length; index++)
    v[index] = sampleLatitude(
      bounds,
      bounds.south + tile.v[index] * (bounds.north - bounds.south)
    );
  const indices = Uint32Array.from(tile.indices);
  return makeSampler(
    bounds,
    Float32Array.from(tile.heightMeters),
    (index, target) => target.set(u[index], v[index], 0),
    (_u, _v, sample) => {
      for (let index = 0; index < indices.length; index += 3) {
        const result = sample(
          indices[index],
          indices[index + 1],
          indices[index + 2]
        );
        if (result !== undefined) return result;
      }
      return undefined;
    },
    noDataHeightMeters
  );
};
