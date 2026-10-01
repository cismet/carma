import { Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { WGS84_A, WGS84_E2 } from "./geodetic";

/** Exact WGS84 projection with reusable raster rows/columns. Height is affine.
 * No LUT approximation or vertical datum conversion is introduced here.
 * One instance belongs to one tile, so the lookup tables remain bounded.
 */
export const createRasterEcefProjector = (options?: {
  maximumCacheEntries?: number;
}) => {
  const maximumCacheEntries = Math.max(
    1,
    options?.maximumCacheEntries ?? Infinity
  );
  const columns = new Map<number, readonly [number, number]>();
  const rows = new Map<number, readonly [number, number, number]>();
  let previousLatitude: number | undefined;
  let previousRow: readonly [number, number, number] | undefined;
  const project = (
    longitude: number,
    latitude: number,
    height: number,
    out: Vector3
  ) => {
    let column = columns.get(longitude);
    if (!column) {
      const radians = degToRadNumeric(longitude);
      column = [Math.cos(radians), Math.sin(radians)];
      if (columns.size >= maximumCacheEntries) columns.clear();
      columns.set(longitude, column);
    }
    let row = latitude === previousLatitude ? previousRow : rows.get(latitude);
    if (!row) {
      const radians = degToRadNumeric(latitude);
      const sin = Math.sin(radians);
      row = [
        Math.cos(radians),
        sin,
        WGS84_A / Math.sqrt(1 - WGS84_E2 * sin * sin),
      ];
      if (rows.size >= maximumCacheEntries) rows.clear();
      rows.set(latitude, row);
    }
    previousLatitude = latitude;
    previousRow = row;
    const radius = row[2] + height;
    return out.set(
      radius * row[0] * column[0],
      radius * row[0] * column[1],
      (row[2] * (1 - WGS84_E2) + height) * row[1]
    );
  };
  const basisPoint = new Vector3();
  // Rotate an east/up/south tangent direction into ECEF with the same cached
  // longitude columns and latitude rows as the position projection.
  return Object.assign(project, {
    /** Numeric lookup payload; JavaScript Map/array bookkeeping is additional. */
    cacheStats: () => ({
      columns: columns.size,
      rows: rows.size,
      numericBytes:
        (columns.size * 3 + rows.size * 4) * Float64Array.BYTES_PER_ELEMENT,
    }),
    direction: (
      longitude: number,
      latitude: number,
      direction: Vector3,
      out: Vector3
    ) => {
      // Reuse the tangent basis without recomputing an unused ECEF position.
      let column = columns.get(longitude);
      let row =
        latitude === previousLatitude ? previousRow : rows.get(latitude);
      if (!column || !row) {
        project(longitude, latitude, 0, basisPoint);
        column = columns.get(longitude)!;
        row = rows.get(latitude)!;
      }
      previousLatitude = latitude;
      previousRow = row;
      const [cosLon, sinLon] = column;
      const [cosLat, sinLat] = row;
      const { x, y, z } = direction;
      return out.set(
        -x * sinLon + y * cosLat * cosLon + z * sinLat * cosLon,
        x * cosLon + y * cosLat * sinLon + z * sinLat * sinLon,
        y * sinLat - z * cosLat
      );
    },
  });
};
